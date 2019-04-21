// ==UserScript==
// @name         Super Google Images
// @namespace    https://github.com/FarisHijazi
// @author       Faris Hijazi
// @version      0.6
// @description  Replace thumbnails with original (full resolution) images on Google images
// @description  Ability to download a zip file of all the images on the page
// @description  Open google images in page instead of new tab
// @include     /^https?://(?:www|encrypted|ipv[46])\.google\.[^/]+/(?:$|[#?]|search|webhp|imgres)/
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @require      https://code.jquery.com/jquery-3.4.0.min.js
// @require      https://raw.githubusercontent.com/kimmobrunfeldt/progressbar.js/master/dist/progressbar.min.js
// @require      https://raw.githubusercontent.com/Stuk/jszip/master/dist/jszip.min.js
// @require      https://github.com/ccampbell/mousetrap/raw/master/mousetrap.min.js
// @require      https://github.com/buzamahmooza/Helpful-Web-Userscripts/raw/master/download_script.user.js
// @run-at       document-start
// @connect      *
// ==/UserScript==


/**
 * Copyright 2019-2030 Faris Hijazi
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

//  ======

/**
 * Metadata object containing info for each image
 * @typedef {Object} Meta
 *
 * @property {string} id:  Id               - example: "ZR4fY_inahuKM:",
 * @property {string} isu: Hostpage URL     - example: "gifs.cc",
 * @property {number} itg: Image Tag        - example: 0,
 * @property {string} ity: Image Type       - example: "gif",
 *
 * @property {number} oh:  Original Height  - example: 322,
 * @property {string} ou:  Original URL     - example: "http://78.media.tumblr.com/....500.gif",
 * @property {number} ow:  Original Width   - example: 492,
 *
 * @property {string} rh:  Referrer Host     - example: "",
 * @property {string} rid: Referrer id      - example: "nyyV1PqBnBltYM",
 * @property {number} rmt: Referrer ? ?     - example: 0,
 * @property {number} rt:  Referrer ? ?     - example: 0,
 * @property {string} ru:  Referrer URL     - example: "",
 *
 * @property {string} pt:  Primary Title    - example: "",
 * @property {string} s:   Description      - example: "Photo",
 * @property {string} st:  Secondary Title  - example: "",
 * @property {number} th:  Thumbnail Height - example: 182,
 * @property {string} tu:  Thumbnail URL    - example: "https://encrypted-tbn0.gstatic.com/images?q",
 * @property {number} tw:  Thumbnail Width  - example: 278
 *
 * my added properties:
 * @property {string} src:  src of the IMG element
 * @property {number[]} dim:  dimensions [width, height]
 */


(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        // var searchModeDiv = document.querySelector('div#hdtb-msb-vis' + ' div.hdtb-msel');
        // if (!(searchModeDiv && searchModeDiv.innerHTML === 'Images')) {
        //     return;
        // }

        var style = document.createElement('style');
        style.textContent = 'a.x_source_link {' + [
            'line-height: 1.0',  // increment the number for a taller thumbnail info-bar
            'text-decoration: none !important',
            'color: inherit !important',
            'display: block !important'
        ].join(';') + '}';
        document.head.appendChild(style);
    }, true);

    var M = (typeof GM !== 'undefined') ? GM : {
        getValue: function (name, alt) {
            var value = GM_getValue(name, alt);
            return {
                then: function (callback) {
                    callback(value);
                }
            };
        },
        setValue: function (name, value) {
            GM_setValue(name, value);
            return {
                then: function (callback) {
                    callback();
                }
            };
        }
    };


    // todo: replace this with importing GM_dummy_functions, and importing a pollyfill
    if (typeof unsafeWindow === 'undefined') unsafeWindow = window;
    // prevents duplicate instances
    if (typeof unsafeWindow.superGoogleScript === 'undefined') {
        unsafeWindow.superGoogleScript = this;
    } else {
        void (0);
    }

    Set.prototype.addAll = function (range) {
        if (range) {
            for (const x of range) {
                this.add(x);
            }
        }
        return this;
    };
    Set.prototype.union = function (other) {
        if (!other.concat) other = Array.from(other);
        return new Set(
            other.concat(Array.from(this))
        );
    };
    Set.prototype.intersection = function (other) {
        if (!other.filter) other = Array.from(other);
        return new Set(
            other.filter(x => this.has(x))
        );
    };
    /** this - other
     * @param other
     * @returns {Set} containing what this has but other doesn't */
    Set.prototype.difference = function (other) {
        if (!other.has) other = new Set(other);
        return new Set(Array.from(this).filter(x => !other.has(x)))
    };

    // === end of basic checks and imports ===

    var showImages = new ShowImages({});
    console.log('SuperGoogle showImages:', showImages);
    unsafeWindow.showImagesSuperGoogle = showImages;

    var pageUrl = new URL(location.href);

    checkImports(['ProgressBar', '$', 'JSZip'], 'SuperGoogle.user.js', true);
    console.debug('SuperGoogle running');

    const Consts = {
        GMValues: {
            ublSites: 'unblocked sites of og images',
            ublUrls: 'unblocked image URLs',
            ublSitesMap: 'UBL sites map',
            hideFailedImagesOnLoad: 'HIDE_FAILED_IMAGES_ON_LOAD'
        },
        Selectors: {
            /** The "All sizes" link from the SearchByImage page*/
            showAllSizes: '#jHnbRc > div.O1id0e > span:nth-child(2) > a',
            searchModeDiv: 'div#hdtb-msb-vis',
            selectedSearchMode: 'div#hdtb-msb-vis' + ' div.hdtb-msel',
            /** the panel element containing the current image [data-ved], so if you observe this element, you can get pretty much get all the data you want.*/
            currentImagePanel: 'a#irc_cb',
            searchBox: 'input[type="text"][title="Search"]',
            googleButtonsContainer: '#hdtb-msb'
        },
        ClassNames: {
            buttons: 'super-button',
            belowDiv: 'below-st-div'
        }
    };
    Consts.ClassNames = $.extend(showImages.ClassNames, Consts.ClassNames);

    // OPTIONS:
    const Preferences = $.extend({
        invertWheelRelativeImageNavigation: false,
        defaultAnchorTarget: '_blank',
        staticNavbar: false,
        loopbackWhenCyclingRelatedImages: false,
        successColor: 'rgb(167, 99, 255)',
        customUrlArgs: {
            // "tbs=isz": "lt",//
            // islt: "2mp",    // isLargerThan
            // tbs: "isz:l",   // l=large, m=medium...
            // "hl": "en"
        },
        hideFailedImagesOnLoad: false,
        periodicallySaveUnblockedSites: false,
        useDdgProxy: true,
        delocalize: true, // use google.com instead of another local url
    }, GM_getValue('Preferences'));


    const GoogleUtils = (function () {
        var isOnGoogle = () => GoogleUtils.elements.selectedSearchMode && GoogleUtils.elements.selectedSearchMode.innerHTML === 'Images';

        const url = {};

        url.isOnEncryptedGoogle = /encrypted.google.com/.test(location.hostname);
        url.googleBaseURL = `https://${/google\./.test(location.hostname) ? location.hostname :
            ((url.isOnEncryptedGoogle ? 'encrypted' : 'www') + '.google.com')}`;
        url.gImgSearchURL = `${url.googleBaseURL}/search?&hl=en&tbm=isch&q=`;
        url.reverseImageSearchUrl = `${url.googleBaseURL}/searchbyimage?&image_url=`;
        url.getGImgReverseSearchURL = _url => _url ? url.reverseImageSearchUrl + encodeURIComponent(_url.trim()) : '';
        url.siteSearchUrl = function (query) {
            if (query) {
                return GoogleUtils.url.gImgSearchURL + 'site:' + encodeURIComponent(query.trim());
            }
        };


        const els = {};
        // copy all the selectors from Consts.Selectors and define getters, now you can access `searchModeDiv` by using `elements.searchModeDiv`
        // if the selector key ends with 's' (plural), then it gets multiple elements, otherwise just a single element
        for (const key of Object.keys(Consts.Selectors)) {
            const v = Consts.Selectors[key];
            els.__defineGetter__(key,
                key.slice(-1).toLowerCase() === 's' ? // ends with 's'? (is plural?)
                    (k) => document.querySelectorAll(v) : (k) => document.querySelector(v));
        }


        const o = {
            url: url,
            elements: els,
        };
        o.__defineGetter__('isOnGoogle', isOnGoogle);
        o.__defineGetter__('isOnGoogleImages', () =>
            new URL(location.href).searchParams.get('tbm') === 'isch' // TODO: find a better way of determining whether the page is a Google Image search
        );

        return o;
    })();

    unsafeWindow.GoogleUtils = GoogleUtils;

    // write back to storage (in case the storage was empty)
    GM_setValue('Preferences', Preferences);

    // GM_setValue(Constants.GMValues.UBL_SITES, "");
    // GM_setValue(Constants.GMValues.UBL_URLS, "");
    // GM_setValue(Constants.GMValues.UBL_SITES_MAP, "");

    const ublSitesSet = new Set(),
        ublMetas = new Set();

    /** Contains the ubl data of a single domain name */
    class UBLdata {
        constructor(href, successful, dataObj) {
            const url = (function () {
                try {
                    return new URL(href);
                } catch (e) {
                    return urlToAnchor(href);
                }
            })();
            this.hostname = url.hostname;
            this.scc_ddgp = 0;
            this.scc_tot = 0;
            /** contains and object with a URL and some data about it
             * @type {Map<Object>} */
            this.resultMap = new Map();

            if (href.length !== this.hostname.length) {
                this.addURL(href, successful, dataObj);
            }
        }

        /** @return {number} % of the URLs unblocked (excluding DDGP) */
        get percentUbl() {
            return 100 * this.scc_tot / this.resultMap.size;
        }
        /** @return {number} % of the URLs unblocked (including DDGP) */
        get percentUblTotal() {
            return 100 * (this.scc_tot + this.scc_ddgp) / this.resultMap.size;
        }
        /** @return {number} % of the URLs unblocked (including DDGP) */
        get percentUblDDGP() {
            return 100 * (this.scc_ddgp) / this.resultMap.size;
        }

        /**
         * @param url: the url that you want to store, and store the data of
         * @param successful: did the image/file load?
         * @param o an object containing data about the image, such as: "dimensions", "title"
         */
        addURL(url, successful, o) {
            if (successful && !this.resultMap.has(url)) {
                if (PProxy.DDG.test(url)) {
                    this.scc_ddgp++;
                } else {
                    this.scc_tot++;
                }
            }
            if (o != null && o.imgEl != null) {
                if (o.dimensions == null)
                    o.dimensions = o.imgEl.getAttribute('img-dim');
            }
            this.resultMap.set(url, o);
            return this;
        }
    }

    let ublMap = new Map();
    ublMap.addURL = function (url, successful, o) {
        const siteHostname = getHostname(url);
        if (this.has(siteHostname)) {
            this.set(siteHostname, this.get(siteHostname).addURL(url, successful, o));
        } else {
            this.set(siteHostname, new UBLdata(url, successful, o));
        }
    };


    const mimeTypesJSON = $.getJSON(
        'https://cdn.rawgit.com/jshttp/mime-db/master/db.json',
        /** (PlainObject data, String textStatus, jqXHR jqXHR) */
        function (data, textStatus, jqXHR) {
            console.log('JQuery.getJSON()\ndata, textStatus, jqXHR :', data, textStatus, jqXHR);
        }
    );


    var zip = new JSZip();
    JSZip.prototype.generateIndexHtml = function generateZipIndexHtml() {
        let html = '';
        for (const key in this.files) {
            if (!this.files.hasOwnProperty(key)) continue;
            try {
                const file = this.files[key];
                /**{url, name, page}*/
                const data = JSON.parse(file.comment ? file.comment : '{}');
                html += `<div>
    <a href="${data.url || file.name}"><img src="${file.name}" alt="${file.name}"></a>
    <div>
        <a href="${data.page}" target="_blank">${file.name}</a>
        <h4>${file.name}</h4>
        <h3>${data.name || file.name}</h3>
    </div>
</div>`;
            } catch (e) {
                console.error(e);
            }
        }
        return zip.file('index.html', new Blob([html], {type: 'text/plain'}));
    };

    var controlsContainerId = 'google-controls-container';
    var progressBar;
    var currentDownloadCount = 0;
    var isTryingToClickLastRelImg = false;

    class GSaves {
        static get initialItem() {
            return google.pmc.colmob.initial_item.map(item => JSON.parse(item));
        }
        /**
         * @return {{ imageUrl:{string}, url:{string}, title:{string}, faviconUrl:{string}, redirectUrl:{string}, realUrl:{string} }}
         */
        static get initialItemObjectList() {
            function item2Obj(item) {
                var itemObj = {};
                try {
                    itemObj.imageUrl = item[9] ? item[9][0] : null; // img url
                    itemObj.url = item[5];
                    itemObj.title = item[6];
                    itemObj.faviconUrl = item[17];
                    itemObj.redirectUrl = item[18];

                    const searchParams = new URL(itemObj.redirectUrl, 'https://www.google.com').searchParams;
                    console.log('searchParams for:', item, searchParams);

                    var q = searchParams.get('q');
                    var qUrl = new URL(q, 'https://google.com');

                    const imgrefurl = qUrl.searchParams.get('imgrefurl') ? qUrl.searchParams.get('imgrefurl') : q;

                    itemObj.realUrl = imgrefurl ? imgrefurl : q;
                } catch (e) {
                    console.error(e);
                }

                return itemObj;
            }
            return this.initialItem.map(item2Obj);
        }
        static get containers() {
            return qa('div.str-clip-card-space:not(.modified)');
        }
        static removeClickListeners(container) {
            container.parentNode.appendChild(createElement(container.outerHTML));
            container.remove();
        }
        static _slipAnchorUnderElement(element, href) {
            var tempInnerHTML = element.innerHTML;
            element.innerHTML = '';
            element.appendChild(createElement(`<a class="mod-anchor" target="_blank" href="${href}">${tempInnerHTML}</a>`));
        }
        static wrapPanels() {
            console.log('wrapGSavesPanels()');

            var iio = this.initialItemObjectList;

            var i = 0;
            for (const container of this.containers) {

                this.removeClickListeners(container);


                if (container.querySelector(['.str-tag-card-images-holder', 'a.wrapper-anchor', 'a.mod-anchor'].join(', '))) {
                    console.warn('element will not be wrapped by anchor:', container);
                    continue;
                }
                // main card
                this._slipAnchorUnderElement(container.querySelector('div.str-wide-card-text-holder'), iio[i].realUrl);

                // title div
                // this.slipAnchorUnderElement(container.querySelector('div.str-wide-card-title'), iio[i].url);

                // img container
                this._slipAnchorUnderElement(container.querySelector('div.str-wide-card-image-holder'), iio[i].imageUrl);

                i++;
            }

            // language=CSS
            addCss(
                    `.str-wide-card {
                        cursor: default !important;
                    }

                    .str-wide-card-title, .str-wide-card-text-holder {
                        display: -webkit-inline-box !important;
                    }

                    .str-wide-card.expandable:not(.expanded) {
                        height: 100%;
                    }`);
        }
        static addDirectUrlsButton(mutationTarget) {
            if (q('#add-direct-urls-button')) return;
            const threeDots = document.querySelector('img[src="https://www.gstatic.com/save/icons/more_horiz_blue.svg"]');

            if (!threeDots) {
                console.warn('dropdown was not found, unable to addJsonToDropdown()');
            } else {
                const dlj = createElement(`<button id="add-direct-urls-button" class="VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-INsAgc Rj2Mlf P62QJc Gdvizd"><span jsname="V67aGc" class="VfPpkd-vQzf8d">Direct urls</span></button>`);
                threeDots.closest('div[role="button"]').after(dlj);
                dlj.onclick = function () {
                    GSaves.addDirectUrls();
                };
            }
        }
        static addDirectUrls(mutationTarget) {
            addCss('.RggFob .mL2B4d { text-align: center; }', 'gsaves-center-anchors');
            console.log('GSaves.addDirectUrls();');
            if (!mutationTarget)
                return;

            for (const a of mutationTarget.querySelectorAll('a.Uc6dJc')) {
                const usp = new URL(a.href, location.href).searchParams;
                if (usp.get('imgrefurl')) {
                    const href = usp.get('imgrefurl');
                    if (!a.parentElement.querySelector('.page-link'))
                        a.after(createElement('<a class="page-link" target="_blank" href="' + href + '">page</a>'))
                }
            }
        }
        /**
         * adds the option to `downloadJson()` to the dropdown
         * safe to call multiple times, it checks if the button was already added
         */
        static addDLJsonButton() {
            if (q('#download-json-button')) // button already exists
                return;

            const threeDots = document.querySelector('img[src="https://www.gstatic.com/save/icons/more_horiz_blue.svg"]');

            if (!threeDots) {
                console.warn('dropdown was not found, unable to addJsonToDropdown()');
            } else {
                const dlj = createElement(`<button id="download-json-button" class="VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-INsAgc Rj2Mlf P62QJc Gdvizd"><span jsname="V67aGc" class="VfPpkd-vQzf8d">Download JSON {}</span></button>`);
                threeDots.closest('div[role="button"]').after(dlj);
                dlj.onclick = function () {
                    GSaves.downloadJson();
                };
            }
        }
        static replaceWithDirectUrls(mutationTarget) {
            console.log('GSaves.toDirectUrls();');
            for (const a of mutationTarget.querySelectorAll('a.Uc6dJc')) {
                const usp = new URL(a.href, location.href).searchParams;
                if (usp.get('imgrefurl')) {
                    a.href = usp.get('imgrefurl');
                }
            }
        }
        static get directUrls() {
            return Array.from(document.querySelectorAll('a.Uc6dJc'))
                .map(a => new URL(a.href, location.href).searchParams.get('imgrefurl'));
        }
        static get jsonSummary() {
            return Array.from(document.querySelectorAll('a.Uc6dJc')).map(a =>
                ({
                    'title': a.getAttribute('aria-label'),
                    'href': a.getAttribute('href'),
                    'site': a.querySelector('.SQJAwb').innerText,
                    'thumbnail': a.querySelector('.DgJKRc').style['background-image'].slice(5, -2)
                })
            );
        }

        static downloadJson() {
            const json = JSON.stringify(Array.from(document.querySelectorAll('a.Uc6dJc')).map(a =>
                ({
                    'title': a.getAttribute('aria-label'),
                    'href': a.getAttribute('href'),
                    'site': a.querySelector('.SQJAwb').innerText,
                    'thumbnail': a.querySelector('.DgJKRc').style['background-image'].slice(5, -2)
                })
            ), null, 4);
            anchorClick(makeTextFile(json), document.title + '.json')
        }
    }


    /** change mouse cursor when hovering over elements for scroll navigation
     * cursor found here:   https://www.flaticon.com/free-icon/arrows_95103#
     */
    /*addCss(`
    
     .grey-scale,
     img[loaded="error"] {
     -webkit-filter: grayscale(1); /!* Webkit *!/
     filter: gray; /!* IE6-9 *!/
     filter: grayscale(1); /!* W3C *!/
     }
    
     img[loaded="error"],
     img[loaded="loading"] {
     opacity: 0.5;
     filter: alpha(opacity=50); /!* For IE8 and earlier *!/
     }
    
     img[loaded="true"] {
     opacity: 1;
     filter: alpha(opacity=100); /!* For IE8 and earlier *!/
     }`);*/


    if (Preferences.delocalize && location.hostname.match(/google\.(.+)/)[1] !== 'com') {
        var newHost = location.hostname.replace(/(google\.)(.+)/i, '$1com');
        console.log('relocating to de-localize:', newHost);
        location.hostname = newHost;
    }

    // URL args: Modifying the URL and adding arguments, such as specifying the size
    if (Preferences.customUrlArgs && Object.keys(Preferences.customUrlArgs).length) {
        const url = new URL(location.href);
        const searchParams = url.searchParams;

        for (const key in Preferences.customUrlArgs) {
            if (Preferences.customUrlArgs.hasOwnProperty(key)) {
                if (searchParams.has(key))
                    searchParams.set(key, Preferences.customUrlArgs[key]);
                else
                    searchParams.append(key, Preferences.customUrlArgs[key]);
            }
        }
        console.debug('new location:', url.toString());

        const areEqual = (
            function equalUrlSearchParams(url1, url2) {
                const sp1 = url1.searchParams;
                const sp2 = url2.searchParams;
                sp1.sort();
                sp2.sort();
                console.log(
                    sp1.toString() + ' === ' + sp2.toString(),
                    '\n ' + sp1.toString() === sp2.toString()
                );
                return sp1.toString() === sp2.toString();
            }
        )(new URL(location.href), url);

        if (!areEqual)
            location.assign(url.toString());
    }


    // todo: move GSaves code to another script
    // if on google.com/saves, add keyboard shortcuts
    if (/google\..+\/save/.test(location.href)) {
        console.log('beginning of google.com/save site...');

        Mousetrap.bind('`', function () {
            GSaves.wrapPanels();
        });

        observeDocument(function () {
            GSaves.addDirectUrlsButton();
            GSaves.addDLJsonButton();
        });

        if (false) {
            observeDocument(function (mutationTarget) {
                console.log('mutationTarget:', mutationTarget);
                if (mutationTarget.querySelector('.str-clip-card-space')) {
                    console.log('mutationTarget invoked wrapGSavesPanelsWithAnchors()');
                    GSaves.wrapPanels();
                }
            });
        }
    }


    /**
     * ImagePanel class
     * Provides functions for a partner element (one of the 3 panels)
     * ## Injecting:
     *  Injecting elements to the panels works with 2 steps:
     *      1- An inject function: this will create the element and put it in the right place (also checks if it already exists or not)
     *      2- An update function: this will be called everytime the panels are changed
     * Abbreviations:
     *  ris: related image search
     *  fc:  focused
     *  sbi: search by image
     */
    class ImagePanel {  // ImagePanel class
        constructor(element) {
            if (typeof element !== 'undefined') {
                this.el = element;
            }
        }

        /** @return {HTMLDivElement|Node} */
        static get mainPanelEl() {
            return q('div#irc_cc');
        }
        /** @return {ImagePanel} returns the panel that is currently in focus (there are 3 panels) */
        static get focP() {
            return this.mainPanelEl ? new ImagePanel(this.mainPanelEl.querySelector('div.irc_c[style*="translate3d(0px, 0px, 0px)"]')) : console.warn('MainPanel not found!');
            // or you could use     document.querySelectorAll('div#irc_cc > div.irc_c[style*="translate3d(0px, 0px, 0px)"]');
        }
        static get noPanelWasOpened() {
            return q('#irc_cb').getAttribute('data-ved') == null;
        }
        static get panelCurrentlyOpen() {
            return q('#irc_bg').style.display !== 'none';
        }
        /**
         @return {Meta}
         */
        get imageData() {
            return getMeta(this.mainImage);
        }
        get isFocused() {
            return this.el.style.transform === 'translate3d(0px, 0px, 0px);';
        }

        /** @return {HTMLDivElement} */
        get titleAndDescriptionDiv() {
            if (!this.el) {
                return;
            }
            const titleAndDescrDiv = this.q('div._cjj, div.Qc8zh, div.i30053').querySelector('div.irc_it');
            if (!titleAndDescrDiv) {
                console.warn('TitleAndDescription div not found!');
            }
            return titleAndDescrDiv;
        }
        /** @return {HTMLAnchorElement} */
        get descriptionEl() {
            const titleDescrDiv = this.titleAndDescriptionDiv;
            if (titleDescrDiv) {
                return titleDescrDiv.querySelector('div.irc_asc');
            } else {
                console.warn('titleAndDescriptionDiv not found for image panel:', this.el);
            }
        }
        get descriptionText() {
            const descr = this.titleAndDescriptionDiv.querySelector('div.irc_asc');

            return cleanGibberish((descr.innerText.length < 2) ? this.pTitle_Text : descr.innerText);
        }
        /** @return {HTMLAnchorElement} */
        get pTitle_Anchor() {
            return this.titleAndDescriptionDiv.querySelector('a.irc_pt');
        }
        get pTitle_Text() {
            if (!this.pTitle_Anchor) {
                console.warn('Title anchor not found!');
                return;
            }
            return cleanGibberish(this.pTitle_Anchor.innerText.replace(getHostname(this.pTitle_Anchor.href), ''));
        }
        /** Secondary title
         * @return {HTMLAnchorElement, Node} */
        get sTitle_Anchor() {
            return this.titleAndDescriptionDiv.querySelector('span a.irc_lth.irc_hol ');
        }
        get sTitle_Text() {
            const secondaryTitle = this.sTitle_Anchor;
            const siteHostName = getHostname(this.sTitle_Anchor.href);
            return cleanGibberish(secondaryTitle.innerText.replace(siteHostName, ''));
        }

        get ris_fc_Url() {
            return this.ris_fc_Div ? this.ris_fc_Div.querySelector('a').href : 'JavaScript:void(0);';
        }
        /** Returns that small square at the bottom right (the focused one)
         * @return {HTMLDivElement} */
        get ris_fc_Div() {
            if (this.ris_Divs)
                for (const div of this.ris_Divs)
                    if (div.classList.contains('irc_rist'))
                        return div;
        }
        /** @return {HTMLDivElement} returns only the last related image div from `ris_Divs()`*/
        get ris_DivLast() {
            var c = this.ris_Divs;
            c = c && Array.from(c);
            return c && c.pop();
        }
        /** @return {HTMLDivElement[]} returns all related image divs (including the "VIEW MORE" div)*/
        get ris_DivsAll() {
            var c = this.ris_Container;
            if (c) return Array.from(c.querySelectorAll('div.irc_rimask'));
        }
        /** @return {HTMLDivElement[]} returns only related image divs (excluding the "VIEW MORE" div)*/
        get ris_Divs() {
            var d = this.ris_DivsAll;
            if (d) return d.filter(div => !div.classList.contains('irc_rismo'));
        }
        /** @return {HTMLDivElement} returns related image container (div.irc-deck)*/
        get ris_Container() {
            return Array.from(this.qa('div.irc_ris > div > div.irc_rit.irc-deck.irc_rit')).pop();
        }


        /**
         * @type {NodeListOf<HTMLAnchorElement>}
         * Visit:       a.i3599.irc_vpl.irc_lth,
         * Save:        a.i15087,
         * View saved:  a.i18192.r-iXoO2jjyyEGY,
         * Share:       a.i17628
         */
        get buttons() {
            const buttonsContainer = this.q('.irc_but_r > tbody > tr');
            const buttons = this.qa('.irc_but_r > tbody > tr a:first-child');

            buttons.Visit = buttonsContainer.querySelector('a.i3599.irc_vpl.irc_lth');
            buttons.Save = buttonsContainer.querySelector('a.i15087');
            buttons.ViewSaved = buttonsContainer.querySelector('a.i18192.r-iXoO2jjyyEGY');
            buttons.Share = buttonsContainer.querySelector('a.i17628');

            return buttons;
        }

        //get imageUrl() {return this.mainImage.src;}

        /** @return {HTMLImageElement }
         * '#irc_mimg > a#irc_mil > img#irc_mi' should work (but it's not working for some reason)*/
        get mainImage() {
            // return this.element.querySelector('#irc_mimg > a#irc_mil > img#irc_mi');
            if (!!this.el) {
                return this.q('img.irc_mi, img.irc_mut');
            }
        }
        get bestNameFromTitle() {
            const sTitle = this.sTitle_Text,
                pTitle = this.pTitle_Text,
                description = this.descriptionText;
            var unionPTitleAndDescrAndSTitle = unionTitleAndDescr(description, unionTitleAndDescr(pTitle, sTitle));

            console.log(
                'BestNameFromTitle:',
                '\nsTitle:', sTitle,
                '\npTitle:', pTitle,
                '\ndescription:', description,
                '\nunionPTitleAndDescrAndSTitle:', unionPTitleAndDescrAndSTitle
            );

            return unionPTitleAndDescrAndSTitle;
        }
        get leftPart() {
            return this.q('.irc_t');
        }
        get rightPart() {
            return this.q('.irc_b.irc_mmc');
        }

        /**
         * if it does return something, then it will NOT continue to adding the new element.
         * @return {*}
         */
        get sbiUrl() {
            const risFcDiv = this.ris_fc_Div;
            var reverseImgSearchUrl = '#';
            if (!!risFcDiv) {
                var imgURL = (risFcDiv.querySelector('img[oldsrc]') || {}).oldsrc || risFcDiv.querySelector('a[href]').href || this.mainImage.src;
                reverseImgSearchUrl = GoogleUtils.url.getGImgReverseSearchURL(imgURL);

                const url = new URL(reverseImgSearchUrl);
                url.searchParams.append('allsizes', '1');
                reverseImgSearchUrl = url.toString();
            }
            return reverseImgSearchUrl;
        }

        /**Goes to the previous (Left) main mainImage*/
        static previousImage() {
            const previousImageArrow = q('div#irc-lac > a');  // id that starts with "irc-la"
            var x = previousImageArrow.style.display !== 'none' ? // is it there?
                !previousImageArrow.click() : // returns true
                false;
            if (!x) console.log('prev arrow doesn\'t exist');
            return x;
        }
        /**Goes to the next (Right) main mainImage*/
        static nextImage() {
            const nextImageArrow = q('div#irc-rac > a');  // id that starts with "irc-ra"
            var x = nextImageArrow.style.display !== 'none' ? // is it there?
                !nextImageArrow.click() : // returns true
                false;
            if (!x) console.log('next arrow doesn\'t exist');
            return x;
        }

        /**
         * Should be called only once for each panel
         * @param panelEl
         */
        static modifyP(panelEl) {
            console.debug('Modifying panelEl:', panelEl);

            // make the X button on the image panel remove the hash from the address bar
            // there exists only a single X button common for all 3 image panels
            document.querySelector('a#irc_cb').addEventListener('click', removeHash);

            let p = new ImagePanel(panelEl);

            const classList = p.rightPart.classList;
            if (!classList.contains('scroll-nav')) {
                classList.add('scroll-nav');
            }

            // add onerror listener to the mainimage
            // this.mainImage.addEventListener('error', function(e) {
            //     console.log('OOPSIE WOOPSIE!! Uwu We made a fucky wucky!! A wittle fucko boingo! The code monkeys at our headquarters are working VEWY HAWD to fix this!', e);
            // });


            // adding text-decoration to secondary title
            p.sTitle_Anchor.parentElement.after(createElement(
                '<div class="' + Consts.ClassNames.belowDiv + ' _r3" style="padding-right: 5px; text-decoration:none;"/></div>'
            ));

            p.inject_SiteSearch();

            p.inject_ViewImage();
            p.inject_DownloadImage();

            p.inject_sbi();

            // waitForElement(() => IP.focusedPanel.relatedImage_Container, () => { p.inject_DownloadRelatedImages(); });
            p.inject_Download_ris();
            p.inject_ImageHost();

            /* @deprecated: the imgDimensions element was removed from the webpage*/
            const dimensionsEl = p.q('.irc_idim');
            if (dimensionsEl) {
                dimensionsEl.addEventListener('click', ImagePanel.moreSizes);
                dimensionsEl.classList.add('hover-click');
            }

            // remove "Images may be subject to copyright" text
            (function removeCopyrightElement() {
                p.sTitle_Anchor.style = 'padding-right: 5px; text-decoration:none;';
                for (const copyrightEl of getElementsByXPath('//span[contains(text(),\'Images may be subject to copyright\')]', p.el))
                    copyrightEl.remove();
            })();

            // injecting rarbg torrent link button
            (function injectRarbgButton() {
                const rarbg_tl = createElement(`<a class="_r3 hover-click o5rIVb torrent-link"
   style=" float: left; padding: 4px; display: inline-block; font-size: 10px; color: white;">
    <img src="https://dyncdn.me/static/20/img/16x16/download.png" alt="Rarbg torrent link" border="0"
         style=" width: 25px; height: 25px; ">
    <label style=" display: list-item; ">Torrent link</label></a>`);
                rarbg_tl.onclick = () => {
                    if (/\/torrent\/|rarbg/i.test(p.pTitle_Anchor.href)) {
                        p.pTitle_Anchor.hostname = 'www.rarbgaccess.org'; // choosing a specific mirror
                        anchorClick(extractRarbgTorrentURL(p.pTitle_Anchor.innerText, p.pTitle_Anchor.href), '_blank');
                    }
                };
                p.pTitle_Anchor.before(rarbg_tl);
            })();

            //@info .irc_ris    class of the relatedImgsDivContainer
            //@info div#isr_mc  the main container containing all the image boxes, and the panels (only 2 children)
            panelEl.addEventListener(
                'wheel',
                /**
                 * @param {WheelEvent} wheelEvent
                 * @return {boolean}
                 */
                function handleScroll(wheelEvent) {
                    if (!wheelEvent.ctrlKey && !wheelEvent.metaKey && !wheelEvent.shiftKey && !wheelEvent.altKey) {
                        const elUnderMouse = elementUnderMouse(wheelEvent);
                        if (ImagePanel.mainPanelEl.contains(elUnderMouse)) {
                            try {
                                // Listen for scroll events
                                const leftPart = ImagePanel.focP.leftPart,
                                    rightPart = ImagePanel.focP.rightPart, // this is NOT the entire RIGHT part
                                    irc_ris = ImagePanel.focP.q('.irc_ris'), // the relative images panel
                                    onLeftSide = isOrContains(leftPart, elUnderMouse), //containsClassName(elUnderMouse, '.irc_t');// on left half of panel
                                    onRightPart = isOrContains(rightPart, elUnderMouse), // on RIGHT half of panel
                                    delta = getWheelDelta(wheelEvent);

                                if (Math.abs(delta) < 0.1) { // Do nothing if didn't scroll
                                    console.debug('Mousewheel didn\'t move');
                                    return false;
                                }
                                /// Wheel definetely moved at this point
                                let wheelUp = Preferences.invertWheelRelativeImageNavigation ? (delta > 0.1) : (delta < 0.1);
                                if (!onLeftSide) {   // If the mouse is under the RIGHT side of the image panel
                                    if (isOrContains(elUnderMouse, leftPart)) {
                                        if (wheelUp) {
                                            ImagePanel.nextImage();
                                        } else {
                                            ImagePanel.previousImage();
                                        }
                                    }
                                    if (onRightPart || isOrContains(irc_ris, elUnderMouse) || (elUnderMouse.classList.contains('irc_mut'))) {
                                        // console.log('elUnderMouse:', elUnderMouse);
                                        if (wheelUp) {
                                            nextRelImg();
                                        } else {
                                            prevRelImg();
                                        }
                                    } else {
                                        console.debug('Mouse wheel did NOT scroll while over a container element.\nelUnderMouse:', elUnderMouse);
                                    }
                                    wheelEvent.preventDefault();
                                }
                                return false;
                            } catch (e) {
                                console.warn(e);
                            }
                        }
                    }
                }
            );

            /**
             *todo: find a library to do this instead, with tooltips as well
             */
            function underliningBinded() {
                // Underlining binded keys
                var keymap = new Map([ // Key: selector, Value: character
                    ['.i15087', 's'],
                    ['.i18192', 'v']
                ]);
                for (const [selector, char] of keymap) {
                    var bindEl = q(selector);
                    if (!bindEl) continue;
                    bindEl.outerHTML = bindEl.outerHTML.replace(new RegExp(char, 'i'), `<u>${char}</u>`);
                }
            }

            (function moveImgDimensionEl() {
                const imgDimEl = p.q('.rn92ee.irc_msc');
                if (!!imgDimEl) {
                    p.sTitle_Anchor.after(imgDimEl);
                }
            })();

            // ImagePanel.updateP(p);
        }

        /**
         * Called once everytime the panel is changed
         * @param panelEl
         * @return {boolean}
         */
        static updateP(panelEl) {
            // console.debug('Updating panel');
            if (!panelEl) {
                console.warn('Null panel passed');
                return false;
            }

            let p = (panelEl instanceof HTMLElement) ? new ImagePanel(panelEl) : panelEl;
            // p.removeLink();
            // p.injectSearchByImage();
            // p.addDownloadRelatedImages();

            p.makeDescriptionClickable();
            p.addImageAttributes();
            p.update_SiteSearch();
            p.update_ViewImage();
            p.update_ImageHost();
            p.update_sbi();


            // rarbg torrent link
            let torrentLink = p.q('.torrent-link');
            if (torrentLink) {
                torrentLink.style.display = /\/torrent\//gi.test(p.pTitle_Anchor.href) ? // is torrent link?
                    'inline-block' : 'none';
            }
        }
        /**
         * fixme: doesn't really work
         * fetches and goes to the page for the current image (similar to image search but just 'more sizes of the same image')
         */
        static moreSizes() {
            const panel = ImagePanel.focP;
            const reverseImgSearchUrl = GoogleUtils.url.getGImgReverseSearchURL(panel.ris_fc_Div.querySelector('img').src);
            let z = open().document;
            fetchUsingProxy(reverseImgSearchUrl, function (content) {
                console.log('content:', content);
                let doc = document.createElement('html');
                doc.innerHTML = content;
                const allSizesAnchor = doc.querySelector(Consts.Selectors.showAllSizes);
                if (allSizesAnchor && allSizesAnchor.href) {
                    fetchUsingProxy(allSizesAnchor.href, function (content2) {
                        let doc2 = document.createElement('html');
                        doc2.innerHTML = content2;
                        z.write(content2);
                    });
                } else {
                    z.write(content);
                }
            });
        }
        static download_ris() {
            const dir = 'GImgRis ' + document.title.replace(/google|com/gi, '');
            const relatedImageDivs = ImagePanel.focP.ris_DivsAll;
            console.log('download related images:', relatedImageDivs);

            //         var metaDataStr = `Google images data for related images
            // Title:     ${document.title}
            // URL:     ${location.href}
            // Search:    ${q('#lst-ib').value}`;
            for (const imgDiv of relatedImageDivs) {
                var img = imgDiv.querySelector('img');
                var metaObj = getMeta(img);
                var imgTitle = '';

                if (Object.keys(metaObj).length <= 2) {
                    console.debug(
                        'Found a metaObject that is too small:', metaObj,
                        '\nReplacing with:', metaObj = getImgMetaById(metaObj.id)
                    );
                }

                imgTitle = metaObj['pt'];
                const href = imgDiv.querySelector('a[href]').href;

                console.log('Downloading:', href, imgTitle, dir, img);
                download(href, imgTitle, dir, img);
            }
            // anchorClick(makeTextFile(metaDataStr), dir + '/' + 'info.txt');
        }
        static downloadCurrentImage() {
            try {
                const panel = ImagePanel.focP;
                const name = panel.bestNameFromTitle;
                console.log('downloadCurrentImage:', name);
                const focused_risDiv = panel.ris_fc_Div;
                var currentImageURL = panel.mainImage.src && panel.mainImage.parentElement.classList.contains('display-original-mainImage') ?
                    focused_risDiv.querySelector('img').src :
                    focused_risDiv.querySelector('[href]').href;
                console.log('Download:', name, currentImageURL);
                download(currentImageURL, name, undefined, focused_risDiv);
                panel.q('.torrent-link').click();
            } catch (e) {
                console.warn(e);
            }
        }

        q() {
            return this.el.querySelector(...arguments);
        }
        qa() {
            return this.el.querySelectorAll(...arguments);
        }

        makeDescriptionClickable() {
            var self = this;
            const descriptionEl = this.descriptionEl;

            function openDescription() {
                window.open(GoogleUtils.url.gImgSearchURL + encodeURIComponent(cleanSymbols(descriptionEl.innerText)), '_blank');
            }

            if (descriptionEl && !descriptionEl.classList.contains('hover-click')) {
                descriptionEl.classList.add(`hover-click`);
                descriptionEl.addEventListener('click', openDescription);
            }
        }
        inject_Download_ris() {
            // const risContainer = this.relatedImage_Container.parentNode;
            const targetEl = this.q('.irc_msc, .irc_ris');//this.q('div.irc_ris');
            if (!targetEl) {
                console.error('q(\'.irc_msc\') element not found and is needed in inject_Download_ris');
                return;
            }
            const className = 'download-related hover-click';
            const text = 'Download&nbsp;Related&nbsp;↓';
            var dataVed = '';

            const buttonHtml = `<a class="${className}" role="button" jsaction="" data-rtid="" jsl="" tabindex="0" data-ved="${dataVed}" style="padding-right: 5px; padding-left: 5px; text-decoration:none;"> <span>${text}</span></a>`;
            var button = createElement(buttonHtml);
            button.addEventListener('click', function (element) {
                ImagePanel.download_ris(element);
                return false;
            });
            targetEl.after(button);
        }
        inject_DownloadImage() {
            const text = 'Download&nbsp;↓';
            if (this.sTitle_Anchor) {
                const dataVed = '';
                const className = 'download-image';

                const buttonHtml = `<td><a class="${className}" role="button" jsaction data-rtid jsl tabindex="0" data-ved="${dataVed}"><span>${text}</span></a></td>`;
                const button = createElement(buttonHtml);
                button.addEventListener('click', function handleClick(element) {
                    ImagePanel.downloadCurrentImage(element);
                    return false;
                });
                var tb = this.buttons[0].parentElement.cloneNode(false);
                tb.appendChild(button);
                return this.q('.view-image').parentNode.after(tb);
            }
        }

        /** Inject the SearchByImage anchor
         * @return {Node} */
        inject_sbi() {
            const href = '#'; //GoogleUtils.url.getGImgReverseSearchURL(this.imageUrl);
            const dataVed = ''; //()=>this.sTitleAnchor.getAttribute('data-ved'); // classes:    _ZR irc_hol i3724 irc_lth
            const className = 'search-by-image';
            var html = `<a class="o5rIVb ${className}" target="${Preferences.defaultAnchorTarget}" href="${href}" data-ved="${dataVed}" rel="noreferrer" data-noload="" referrerpolicy="no-referrer" tabindex="0" data-ctbtn="2"<span class="irc_ho" dir="ltr" style="text-align: left;">Search&nbsp;by&nbsp;image</span></a>`;

            return this.addElementAfterSTitle(html, className, null, 'RIGHT');
        }
        update_sbi() {
            // updating ImageHost
            const sbi = this.q('a.search-by-image');
            if (sbi) {
                sbi.href = this.sbiUrl;
            } else {
                console.warn('SearchByImage element not found:', sbi);
            }
        }

        inject_ViewImage() {
            const text = 'View&nbsp;image';
            if (this.sTitle_Anchor) {
                const dataVed = '';
                const className = 'view-image';

                const buttonHtml = `<td><a href="JavaScript:void(0);" target="${'_blank'}" class="${className}" role="button" jsaction="" data-rtid="" jsl="" tabindex="0" data-ved="${dataVed}"> <span>${text}</span></a></td>`;
                const link = createElement(buttonHtml);
                var globeIcon = document.querySelector('._RKw._wtf._Ptf');
                if (!globeIcon) {
                    globeIcon = document.querySelector('.RL3J9c.Cws1Yc.wmCrUb');
                }
                if (!!globeIcon)
                    link.firstElementChild.before(globeIcon.cloneNode(true));

                var tb = this.buttons[0].parentElement.cloneNode(false);
                tb.appendChild(link);


                var afterSaveBtn = false; // add View image button after save button?
                const saveBtn = this.q('.iv_mssc.i35661');
                return (afterSaveBtn ? saveBtn.parentNode : this.buttons[0].parentNode).after(tb);
            }
        }
        update_ViewImage() {
            const viewImage = this.q('.view-image');
            if (viewImage) {
                viewImage.href = ImagePanel.focP.ris_fc_Url;
            } else {
                console.warn('viewImage element not found:', viewImage);
            }
        }

        inject_ImageHost() {
            // console.debug('this.qa(".irc_msc"):', this.qa('.irc_msc, .irc_ris'));
            let container = this.q('.irc_msc, .irc_ris');

            if (this.sTitle_Anchor) {
                // const summaryTable = this.element.querySelector('table[summary]._FKw.irc_but_r');
                var className = 'image-host hover-click';
                const element = createElement(`<a class="${className}" href="" target="${Preferences.defaultAnchorTarget}" rel="noreferrer" data-noload="" referrerpolicy="no-referrer" tabindex="0"  data-ved="" data-ctbtn="2" 
style="padding-right: 5px; padding-left: 5px; text-decoration:none;"
<span class="irc_ho" dir="ltr" style="text-align: center;">Image&nbsp;Host</span></a>`);
                // const button = this.addElementAfterSTitle(html, "image-host hover-click", null, 'NONE');
                container.after(element);
                return element;
            }
        }
        update_ImageHost() {
            const focusedImageDiv = ImagePanel.focP.ris_fc_Div;
            if (focusedImageDiv) {
                const url = focusedImageDiv.querySelector('a').href;
                const hostname = getHostname(PProxy.DDG.test(url) ? PProxy.DDG.reverse(url) : url);
                // updating ImageHost
                const ih = this.q('a.image-host');
                if (ih) {
                    ih.innerText = hostname;
                    ih.href = GoogleUtils.url.gImgSearchURL + 'site:' + hostname;

                    if (ublSitesSet.has(hostname))
                        setStyleInHTML(ih, 'color', `${Preferences.successColor} !important`);
                } else {
                    console.warn('ImageHost element not found:', ih);
                }
            }
        }

        siteSearch() {
            try {
                const hostname = getHostname(this.sTitle_Anchor.href);
                console.log('Site search:', hostname);
                openInTab(GoogleUtils.url.siteSearchUrl(getHostname(this.sTitle_Anchor.href)));
            } catch (e) {
                console.warn(e);
            }
        }

        inject_SiteSearch() {
            const href = '#'; //GoogleUtils.url.getGImgReverseSearchURL(this.imageUrl);
            const dataVed = '';//()=>this.sTitleAnchor.getAttribute('data-ved'); // classes:    _ZR irc_hol i3724 irc_lth
            const hostname = getHostname(this.sTitle_Anchor.href);
            const spanClass = 'site-search';
            const html = `<a class="${spanClass} _r3 hover-click o5rIVb" target="${Preferences.defaultAnchorTarget}" rel="noreferrer" data-noload="" referrerpolicy="no-referrer" tabindex="0" href="${href}" data-ved="${dataVed}" data-ctbtn="2"<span class="irc_ho" dir="ltr" style="text-align: left;font-size: 12px;" >Site: ${hostname}</span></a>`;
            var siteSearch = createElement(html);

            let ddgSearch = siteSearch.cloneNode(false);
            ddgSearch.innerText = '[DDGP]';
            ddgSearch.id = 'ddgSearch';

            siteSearch = this.addElementAfterSTitle(siteSearch, '', null, 'BOTTOM', 'div');
            siteSearch.appendChild(ddgSearch);
            return siteSearch;
        }
        update_SiteSearch() {
            const siteSearchAnchor = this.q('a.site-search');
            const hostname = getHostname(this.sTitle_Anchor.href);
            if (siteSearchAnchor) {
                siteSearchAnchor.innerText = hostname;
                siteSearchAnchor.href = (GoogleUtils.url.siteSearchUrl(getHostname(ImagePanel.focP.q('span a.irc_lth.irc_hol').href)));
            } else {
                console.warn('Site Search element not found:', siteSearchAnchor);
            }

            const ddgAnchor = this.q('#ddgSearch');
            if (ddgAnchor) {
                ddgAnchor.href = PProxy.DDG.proxy(this.pTitle_Anchor.href);
            }

            if (ublSitesSet.has(hostname))
                setStyleInHTML(this.sTitle_Anchor, 'color', `${Preferences.successColor} !important`);
        }

        /** Removes the annoying image link when the panel is open */
        removeLink() {
            const image = this.mainImage;
            const anchor = image.parentNode;
            anchor.href = null;
            console.log('anchor.href', anchor.href);
        }
        addImageAttributes() {
            this.mainImage.setAttribute('img-title', this.pTitle_Text);
            this.mainImage.setAttribute('img-subtitle', this.sTitle_Text);
            this.mainImage.setAttribute('description', this.descriptionText);
            this.mainImage.setAttribute('download-name', this.sTitle_Text);
        }
        lookupTitle() {
            console.log('lookup title:', this.bestNameFromTitle);
            openInTab(GoogleUtils.url.gImgSearchURL + encodeURIComponent(cleanSymbols(this.bestNameFromTitle)));
        }

        /**
         * Creates an element from the given html and appends it next to the sTitle in the image panel
         * @param html
         * @param {string} containerClassName   className attribute to add to the parent of the created element
         * @param {function} clickListener      the click listener to add to the element
         * @param position BOTTOM, LEFT, RIGHT, NONE
         * @param parentTagName
         * @return {Node}
         */
        addElementAfterSTitle(html, containerClassName, clickListener, position, parentTagName) {
            // if (!position) position = 'BOTTOM';

            const element = (typeof html === 'string') ? createElement(html) : html;
            parentTagName = parentTagName ? parentTagName : 'span';
            const containerEl = createElement(`<${parentTagName} class="_r3 ${containerClassName}" style="padding-right: 5px; text-decoration:none;"/>`);
            containerEl.appendChild(element);
            element.classList.add('o5rIVb');

            const sTitle = this.sTitle_Anchor;
            switch (position) {
                case 'BOTTOM':
                    // check if the below-st-div exists, create if it doesn't, then appendChild
                    let belowDiv = sTitle.parentElement.parentElement.querySelector(`.${Consts.ClassNames.belowDiv}`);
                    belowDiv.after(containerEl);
                    break;
                case 'LEFT':
                    sTitle.before(containerEl);
                    break;
                case 'RIGHT':
                    sTitle.parentNode.appendChild(containerEl);
                    break;
                case 'NONE':
                    break;
                default:
                    console.warn('Invalid position passed:', position);
            }
            if (clickListener) {
                element.addEventListener('click', function (element) {
                    clickListener(element);
                    return false;
                });
            }
            return containerEl;
        }
    }

    const clearEffectsDelayed = (function () {
        let timeOut;
        return function () {
            clearTimeout(timeOut);
            timeOut = setTimeout(function () {
                clearAllEffects();
                // updateQualifiedImagesLabel();
            }, 800);
        };
    })();


    $('body').ready(go);


    setInterval(clickLoadMoreImages, 400);

    // === start of function definitions ===

    /**
     * Called every time a panel mutation is observed
     */
    function onPanelMutation(mutations, panelEl) {
        ImagePanel.updateP(panelEl);

        (function updateSliderLimits() {
            // optimization: have a global `metaDatas` object that gets updated when new images are loaded, this prevents unneeded excessive calls
            const metaDatas = Array.from(getImgBoxes()).map(getMeta);
            const dimensions = metaDatas.map(meta => [meta.ow, meta.oh]);
            const maxDimension = Math.max.apply(this, dimensions.map(wh => Math.max.apply(this, wh)));
            const minDimension = Math.min.apply(this, dimensions.map(wh => Math.min.apply(this, wh)));
            // todo: get the min dimension and the max dimension, and make the limits of the slider depend on what images exist

            const minImgSizeSlider = q('#minImgSizeSlider');
            if (minImgSizeSlider) {
                minImgSizeSlider.max = maxDimension + minDimension % minImgSizeSlider.step;
                minImgSizeSlider.min = minDimension - minDimension % minImgSizeSlider.step;
            }

            const dlLimitSlider = q('#dlLimitSlider');
            if (dlLimitSlider) {
                dlLimitSlider.setAttribute('max', metaDatas.length.toString());
                dlLimitSlider.value = metaDatas.length;
                // TODO: also update the label value
            }
        })();
    }

    function go() {

        // wait for the showAllSizes link to appear then click it
        $(Consts.Selectors.showAllSizes).ready((jq) => {
            return jq(Consts.Selectors.showAllSizes).each(el => el.click && el.click());
        });

        if (GoogleUtils.isOnGoogleImages) {
            googleDirectLinks();

            bindKeys();

            // observe new image boxes that load
            observeDocument(function (mutationTarget, addedNodes) {
                const addedImageBoxes = getImgBoxes(':not(.rg_bx_listed)');
                if (addedImageBoxes.length) {
                    onImageBatchLoading(addedImageBoxes);
                    updateDownloadBtnText();
                }
            }, {singleCallbackPerMutation: true});


            // iterating over the stored ubl sites
            for (const ublHostname of GM_getValue(Consts.GMValues.ublSites, new Set())) ublSitesSet.add(ublHostname);
            for (const ublURL of GM_getValue(Consts.GMValues.ublUrls, new Set())) ublMetas.add(ublURL);
            for (const [ublHostname, data] of new Map(GM_getValue(Consts.GMValues.ublSitesMap, new Map()))) ublMap.set(ublHostname, data);
            if (Preferences.periodicallySaveUnblockedSites)
                setInterval(storeUblSitesSet, 5000);


            // wait for panel to appear then start modding
            elementReady('div#irc_cc > div.irc_c[style*="translate3d(0px, 0px, 0px)"]').then(panels => qa('#irc_cc > div').forEach(function (panelEl) {
                console.log('panel element ready', panelEl);

                // make one-time modifications
                ImagePanel.modifyP(panelEl);

                // bind mutation observer, observes every change happening to the panels (any one of them)
                const mutationObserver = new MutationObserver(function (mutations, observer) {
                    // #todo: optimize callbacks, #profiler:  17.9% of the browser delay is from this
                    console.log('panelMutationCallback()');

                    observer.disconnect(); // stop watching until changes are done

                    onPanelMutation(mutations, panelEl);

                    observer.observePanels(); // continue observing
                });

                // creating a function (template for observing)
                mutationObserver.observePanels = function () {
                    mutationObserver.observe(panelEl, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['data-ved']
                    });
                };

                mutationObserver.observePanels();
            }));

            elementReady('#hdtb-msb').then(injectGoogleButtons);


            // automatically display originals if searching for a site:
            if (/q=site:/i.test(location.href) && !/tbs=rimg:/i.test(location.href)) {
                showImages.displayImages();
            }

        } else {
            // bind each result to the corresponding number
            for (let i = 0, results = qa('div.srg > div'); i < results.length; i++) {
                Mousetrap.bind(`${i + 1}`, () => {
                    results[i].querySelector('a').click();
                });
                results[i].before(createElement(`<strong style="float: left;">${i + 1}</strong>`));
            }
        }
    }

    function bindKeys() {

        Mousetrap.addKeycodes({
            96: 'numpad0',
            97: 'numpad1',
            98: 'numpad2',
            99: 'numpad3',
            100: 'numpad4',
            101: 'numpad5',
            102: 'numpad6',
            103: 'numpad7',
            104: 'numpad8',
            105: 'numpad9'
        });

        Mousetrap.bind(['c c'], cleanupSearch);
        Mousetrap.bind(['u'], () => {
            location.assign(safeSearchOffUrl());
        });
        // to https://yandex.com/images/search?text=
        Mousetrap.bind('y d x', () => {
            var x = 'https://yandex.com/images/search?text=' + encodeURIComponent(new URL(location.href).searchParams.get('q'));
            console.log('Yandex url = ', x);
            location.assign(x);
        });


        Mousetrap.bind(['alt+a'], () => {
            (!q('#itp_animated').firstElementChild ? q('#itp_').firstElementChild : q('#itp_animated').firstElementChild).click();
        });
        Mousetrap.bind(['D'], () => {
            q('#downloadBtn').click();
        });
        Mousetrap.bind(['h'], () => {
            q('#hideFailedImagesBox').click();
        });
        Mousetrap.bind(['g'], () => {
            q('#GIFsOnlyBox').click();
        });
        Mousetrap.bind(['esc', 'escape'], removeHash);


        // keys that don't need a focusedPanel and all those other variables
        Mousetrap.bind(['ctrl+alt+r'], toggleEncryptedGoogle);
        Mousetrap.bind(['i'], function (e) {
            var mi = getMenuItems();
            mi.images.firstElementChild && mi.images.firstElementChild.click();
        });
        Mousetrap.bind(['/'], function (e) { // focus search box
            const searchBar = q(Consts.Selectors.searchBox);
            if (!$(searchBar).is(':focus')) {
                searchBar.focus();
                searchBar.scrollIntoView();
                searchBar.select();
                searchBar.setSelectionRange(searchBar.value.length, searchBar.value.length);
                e.preventDefault();
            }
        });
        // beep

        // @info mainImage drop-down panel:    #irc_bg

        // // keys between 1 and (#buttons-1)
        // for (let i = 1; i <= 5; i++) { /*it should have around 5 buttons, not sure how many it actually has*/
        //     Mousetrap.bind(i.toString(), function (e) {
        //         ImagePanel.focP && ImagePanel.focP.buttons && i <= ImagePanel.focP.buttons.length && ImagePanel.focP.buttons[i - 1].click();
        //     });
        // }

        Mousetrap.bind(['ctrl+['], siteSearch_TrimLeft);
        Mousetrap.bind(['ctrl+]'], siteSearch_TrimRight);

        Mousetrap.bind(['['], function (e) {
            q('#minImgSizeSlider').stepDown()
        });
        Mousetrap.bind([']'], function (e) {
            q('#minImgSizeSlider').stepUp();
        });


        Mousetrap.bind([`'`], function (e) {
            Preferences.loopbackWhenCyclingRelatedImages = !Preferences.loopbackWhenCyclingRelatedImages;
            GM_setValue('LOOP_RELATED_IMAGES', Preferences.loopbackWhenCyclingRelatedImages);
            console.log('LOOP_RELATED_IMAGES toggled to:', Preferences.loopbackWhenCyclingRelatedImages);
        });
        Mousetrap.bind(['t'], function (e) {
            console.debug('Torrent search');
            openInTab(GoogleUtils.url.gImgSearchURL + encodeURIComponent('+torrent +rarbg ' + cleanSymbols(ImagePanel.focP.bestNameFromTitle)));
        });
        Mousetrap.bind(['s'], function (e) {
            var btn_Save = ImagePanel.focP.q('.i15087');
            console.debug('btn_Save', btn_Save);
            if (!!btn_Save) btn_Save.click();
        });
        Mousetrap.bind(['v'], function (e) {
            var btn_ViewSaves = ImagePanel.focP.q('.i18192');
            console.debug('btn_ViewSaves', btn_ViewSaves);
            if (!!btn_ViewSaves) btn_ViewSaves.click();
        });
        Mousetrap.bind(['b', 'numpad1'], function (e) {// ⬋ Search by image
            if (ImagePanel.focP.mainImage) {
                ImagePanel.focP.q('a.search-by-image').click();
            } else {
                console.error('Image not found', ImagePanel.focP.ris_fc_Url);
            }
        }, 'keydown');
        Mousetrap.bind(['numpad4'], function (e) {// ◀
            ImagePanel.previousImage();
        }, 'keydown');
        Mousetrap.bind(['numpad6'], function (e) { // ▶
            ImagePanel.nextImage();
        }, 'keydown');
        Mousetrap.bind(['numpad3'], function (e) {// ⬊ Open related images in new tab
            const moreRelatedImagesLink = ImagePanel.focP.q('.irc_rismo.irc_rimask a');
            if (moreRelatedImagesLink != null) {
                openInTab(moreRelatedImagesLink.href);
            }
        }, 'keydown');
        Mousetrap.bind(['d', 'numpad5'], ImagePanel.downloadCurrentImage, 'keydown');


        Mousetrap.bind(['enter'], function (e) {
            const currentImgUrl = ImagePanel.focP.ris_fc_Url;
            console.log('currentImgUrl:', currentImgUrl);
            openInTab(currentImgUrl);
        });
        Mousetrap.bind([',', 'up', 'numpad8'], function (e) { // ▲ Prev/Left relImage
            prevRelImg();
            e.preventDefault();
        }, 'keydown');
        Mousetrap.bind(['.', 'down', 'numpad2'], function (e) {// Next related mainImage
            nextRelImg();
            e.preventDefault();
        }, 'keydown');
        Mousetrap.bind(['o'], function (e) {
            for (var div of ImagePanel.focP.ris_Divs) {
                const img = div.querySelector('img');
                var anchor = img.closest('a[href]');
                console.log('Replacing with original:', img, 'Anchor:', anchor);
                showImages.replaceImgSrc(img, anchor);
            }
        });
        Mousetrap.bind(['h'], function (e) {
            q('#rcnt').style.visibility = (/hidden/i).test(q('#rcnt').style.visibility) ? 'visible' : 'hidden';
            e.preventDefault();
        });
        Mousetrap.bind(['m'], ImagePanel.download_ris);
        Mousetrap.bind(['numpad7'], function (e) {// ⬉ lookup the images title.
            const visitUrl = ImagePanel.focP.buttons[0].href;
            // const visitTitleUrl = subtitleEl.href;

            console.log('Visit:', visitUrl);
            openInTab(visitUrl);
        }, 'keydown');
        // Search using title
        Mousetrap.bind(['numpad9'], () => ImagePanel.focP.lookupTitle(), 'keydown');
        Mousetrap.bind([';'], () => ImagePanel.focP.siteSearch());

        // TODO: find a hotkey for this function
        /*openInTab(`${gImgSearchURL}${encodeURIComponent(cleanSymbols(focusedPanel.descriptionText).trim())}`);
        e.preventDefault();*/

        console.log('added super google key listener');
    }

    // attach chgMon to document.body
    function cleanupSearch() {
        console.log('cleanupSearch()');
        const searchBar = q(Consts.Selectors.searchBox);
        searchBar.value = cleanDates(searchBar.value).replace(/\s+|[.\-_]+/g, ' ');
    }


    /**
     * Add small text box containing image extension
     * @param {HTMLDivElement} imgBox
     */
    function addImgExtensionBox(imgBox) {
        if (imgBox.querySelector('.text-block')) return;
        const img = imgBox.querySelector('img.rg_ic.rg_i'),
            meta = getMeta(img),
            ext = meta ? meta.ity : img.src.match(/\.(jpg|jpeg|tiff|png|gif)($|\?)/i);
        if (!ext) return;
        const textBox = createElement(`<div class="text-block ext ext-${ext}"></div>`);
        if (!ext.toUpperCase) {
            console.warn('ext.toUpperCase is not a function:', ext);
            return;
        }
        textBox.innerText = ext.toUpperCase();
        // textBox.style["background-color"] = (ext == 'gif') ? "magenta" : "#83a3ff";
        img.after(textBox);
        img.classList.add('ext', `ext-${ext}`);
    }
    function addImgDownloadButton(imgBox) {
        if (imgBox.querySelector('.download-block'))
            return;
        const img = imgBox.querySelector('img.rg_ic.rg_i');
        const meta = getMeta(img);
        const src = meta ? meta.ou : img.src;

        const downloadButton = createElement(`<div class="text-block download-block"
     href="JavaScript:void(0);" 
    style="background-color: dodgerblue; margin-left: 35px;">[⇓]</div>`);
        downloadButton.onclick = function (e) {
            download(src, unionTitleAndDescr(meta.s, unionTitleAndDescr(meta.pt, meta.st)));
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
        };

        img.after(downloadButton);
        img.classList.add('has-dl');
    }

    /**
     * Checks that the `window` object contains the properties in `importNames`
     * @param {Array} importNames
     * @param {String} scriptName
     * @param {Boolean} stopExecution if there are missing
     */
    function checkImports(importNames = [], scriptName = '', stopExecution = false) {
        const missing = [];
        for (const importName of importNames.filter(i => !!i)) {
            if (!window.hasOwnProperty(importName)) {
                console.error(
                    '[' + scriptName + '] script has a is missing an import:', importName,
                    '\nPlease make sure that it is included in the "//@require" field in the userscript metadata block'
                );
                missing.push(importName);
            }
        }
        if (missing.length !== 0 && stopExecution) {
            console.error('Stopping execution due to missing imports:', missing);
            void (0);
            return missing;
        }
        return missing;
    }

    /**
     * is el1 == el2 OR contains el2?
     * @param element
     * @param el2
     * @return {boolean}
     */
    function isOrContains(element, el2) {
        if (element === el2) console.debug('element == el2', element, el2);
        return element.contains(el2) || element === el2;
    }

    function getImgMetaById(id) {
        for (const metaEl of qa('div.rg_meta')) {
            if (metaEl.innerText.indexOf(id) > -1) {
                try {
                    return JSON.parse(metaEl.innerText);
                } catch (e) {
                    console.warn(e);
                    return false;
                }
            }
        }
        return false;
    }

    function genZip(thisZip = zip) {
        thisZip.file('index (online).html', new Blob([getIndexHtml()], {type: 'text/plain'}));
        thisZip.generateIndexHtml();
        thisZip.generateAsync({type: 'blob'}).then(function (content) {
                var zipName = (document.title).replace(/site:|( - Google Search)/gi, '');

                saveAs(content, `${zipName} [${Object.keys(thisZip.files).length}].zip`);
                unsafeWindow.zipGenerated = true;

                window.removeEventListener('beforeunload', zipBeforeUnload);
                window.onunload = null;
            }
        );
    }

    /**
     * @param {string} torrentName
     * @param {string} torrentPageURL
     * @returns {string}
     * https://rarbgaccess.org/download.php?id= kmvf126 &f= <TorrentName>-[rarbg.to].torrent
     */
    function extractRarbgTorrentURL(torrentName, torrentPageURL) {
        const torrentURL = torrentPageURL.replace(/torrent\//i, 'download.php?id=') + '&f=' + torrentName.split(/\s+/)[0];
        console.debug('extracted rarbg torrent URL:', torrentURL);
        return torrentURL;
    }

    /** @param visibleThumbnailsOnly {boolean}: optional: set to true to exclude thumbnails that aren't visible
     * @returns {NodeListOf<HTMLImageElement>} */
    function getThumbnails(visibleThumbnailsOnly = false) {
        // language=CSS
        const selector = 'div.rg_bx > a.rg_l[jsname="hSRGPd"] > img' +
            (visibleThumbnailsOnly ? ':not([style*=":none;"]):not([visibility="hidden"])' : '')
        ;
        return qa(selector);
    }

    function updateQualifiedImagesLabel(value) {
        value = value != null ? value : Array.from(getQualifiedGImgs()).length;
        const satCondLabel = q('#satCondLabel');
        if (satCondLabel)
            satCondLabel.innerHTML = value + ' images satisfying conditions';

        const dlLimitSlider = q('#dlLimitSlider');
        if (dlLimitSlider && dlLimitSlider.value < value) {
            dlLimitSlider.setAttribute('value', value);
            q('#dlLimitSliderValue').innerText = value;
        }
    }
    function highlightSelection() {
        const sliderValueDlLimit = this.value;
        q('#dlLimitSliderValue').innerHTML = sliderValueDlLimit;

        // Highlighting images that will be downloaded
        var i = 0;
        for (const img of getImgBoxes(' img')) {
            if (i <= sliderValueDlLimit && img.classList.contains('qualified-dimensions')) {
                img.classList.add('drop-shadow', 'out');
                img.classList.remove('in');
                i++;
            } else {
                img.classList.remove('out');
                img.classList.add('blur', 'in');
            }
        }

        updateQualifiedImagesLabel();
    }

    /**Modify the navbar and add custom buttons*/
    function injectGoogleButtons() {
        console.log('injectGoogleButtons()');
        const controlsContainer = createElement(`<div id="${controlsContainerId}"</div>`);
        /*q('#abar_button_opt').parentNode*/ //The "Settings" button in the google images page

        const navbar = createAndGetNavbar(function (topnavContentDiv) {
            const gNavbar = q('#rshdr');
            topnavContentDiv.before(gNavbar, q('#searchform'));
            topnavContentDiv.appendChild(controlsContainer);
        });

        // auto-click on "tools" if on Google Images @google-specific
        const toolsButton = q('.hdtb-tl');
        if (!!toolsButton) {
            if (!toolsButton.classList.contains('hdtb-tl-sel')) { // if the tools bar is not already visible (not already clicked)
                toolsButton.click();
            } else console.warn('tools button already activated');
        } else console.warn('tools button not found');


        // var linkAnimated = createElement('<a style="display:" class="hdtb-tl" href="#" onclick="alert("finally"); document.getElementById("itp_animated").firstElementChild.click();">Animated</a>');

        // buttons
        const createGButton = (id, innerText, onClick) => {
            const button = createElement(`<button class="${Consts.ClassNames.buttons} sg sbtn hdtb-tl" id="${id}">${innerText.replace(/\s/g, '&nbsp;')}</button>`);
            if (onClick && typeof (onClick) === 'function') {
                button.onclick = function () {
                    onClick();
                };
            }
            return button;
        };


        /**
         * @param id    the checkbox element id
         * @param labelText
         * @param onChange    what happens when the text box changes?
         * @param checked
         * @returns {HTMLDivElement} this label element contains a checkbox input element
         */
        const createGCheckBox = (id, labelText, onChange, checked) => {
            checked = checked === true || GM_getValue(id); // get default value if not passed
            labelText = labelText.replace(/\s/g, '&nbsp;');

            const checkBoxContainerEl = createElement(
                `<div class="sg" style="display:inline;">
<input id="${id}" type="checkbox" ${checked ? 'checked="checked"' : ''}>
<label for="${id}">${labelText}</label>
</div>`);
            if (typeof onChange === 'function') {
                checkBoxContainerEl.addEventListener('change', onChange);
            }
            return checkBoxContainerEl;
        };

        // Check boxes
        const cbox_ShowFailedImages = createGCheckBox('hideFailedImagesBox', 'Hide failed images', function () {
            const checked = q('#hideFailedImagesBox').checked;
            setVisibilityForImages(!checked, isFailedImage);
            Preferences.hideFailedImagesOnLoad = !checked; // remember the preference
        }, Preferences.hideFailedImagesOnLoad);
        const cbox_GIFsOnly = createGCheckBox('GIFsOnlyBox', 'GIFs only', function () {
            setVisibilityForImages(!q('#GIFsOnlyBox').checked, isGif, false, true); // hide nonGifs when NOT checked
        }, false);
        const cbox_UseDdgProxy = createGCheckBox('useDdgProxyBox', 'Use proxy',
            () => {
                Preferences.useDdgProxy = q('#useDdgProxyBox').checked;
                updateQualifiedImagesLabel();
            },
            Preferences.useDdgProxy
        );
        const cbox_GIFsException = createGCheckBox('GIFsExceptionBox', 'Always download GIFs',
            () => GM_setValue('GIFsException', q('#GIFsExceptionBox').checked),
            GM_getValue('GIFsException', true)
        );
        const cbox_OnlyShowQualifiedImages = createGCheckBox('OnlyShowQualifiedImages', 'Only show qualified images',
            () => GM_setValue('OnlyShowQualifiedImages', this.checked), //fixme: causes an error: "Uncaught TypeError: Cannot read property 'checked' of undefined" only for the `Only show qualified images` checkbox
            GM_getValue('OnlyShowQualifiedImages', false)
        );
        const cbox_ZIP = createGCheckBox('zipInsteadOfDownload', 'ZIP', function changeZIPBtnText() {
            const checked = cbox_ZIP.checked;
            updateDownloadBtnText();
            GM_setValue('zipInsteadOfDownload', checked);
        }, GM_getValue('zipInsteadOfDownload', true));
        cbox_ZIP.style.padding = '0px';


        const isGif = img_bx => getMeta(img_bx).ity === 'gif' || /\.gif($|\?)/.test(getMeta(img_bx).ou);
        const isFailedImage = (img_bx) => img_bx.classList.contains(Consts.ClassNames.FAILED_DDG) || img_bx.classList.contains(Consts.ClassNames.FAILED_DDG);


        for (const img of getThumbnails(true)) {
            img.classList.add('blur');
        }


        const constraintsContainer = (function () {
            // todo: see this nice link, maybe use it one day https://css-tricks.com/value-bubbles-for-range-inputs/

            const default_slider_minImgSize_value = 250;
            const slider_minImgSize = createElement(`<input id="minImgSizeSlider" type="range" min="0" max="3000" value="${default_slider_minImgSize_value}" step="50">`);

            var sliderReading_minImgSize = createElement(`<label for="minImgSizeSlider" id="minImgSizeSliderValue">${slider_minImgSize.value}x${slider_minImgSize.value}</label>`);
            slider_minImgSize.oninput = function () {
                sliderReading_minImgSize.innerHTML = /*'Min Dimensions<br>' +*/ (`${this.value}x${this.value}`);

                // Highlighting images that will be downloaded
                // clearAllEffects(); // todo: this is being called too much
                for (const img of getThumbnails(true)) {
                    var meta = getMeta(img);
                    var width = meta.ow, height = meta.oh,
                        isBigger = width >= this.value || height >= this.value;

                    if (isBigger) {
                        img.classList.add('qualified-dimensions', 'out');
                        img.classList.remove('in');
                    } else {
                        img.classList.add('blur', 'in');
                        img.classList.remove('qualified-dimensions');
                    }
                }
                updateQualifiedImagesLabel(getQualifiedGImgs({
                    ogs: qa('img.rg_ic.rg_i'),
                    exception4smallGifs: null,
                    ignoreDlLimit: true
                }).size);
            };
            slider_minImgSize.onchange = function () {
                // todo: maybe this can be done using a CSS, rather than manually changing it every time
                // hide images that are too small
                setVisibilityForImages(false, '.sg-too-small-hide', false);
                clearEffectsDelayed();
                updateQualifiedImagesLabel();
            };

            const slider_dlLimit = createElement(`<input id="dlLimitSlider" type="range" min="1" max="${1000}" value="20">`);
            var sliderReading_dlLimit = createElement(`<label id="dlLimitSliderValue">${slider_dlLimit.value}</strong>`);
            slider_dlLimit.oninput = highlightSelection;
            slider_dlLimit.onchange = clearEffectsDelayed;


            var tr1 = document.createElement('tr');
            tr1.appendChild(slider_minImgSize);
            tr1.appendChild(sliderReading_minImgSize);

            var tr2 = document.createElement('tr');
            tr2.appendChild(slider_dlLimit);
            tr2.appendChild(sliderReading_dlLimit);

            var constraintsContainer = document.createElement('tb');
            constraintsContainer.classList.add('sg');
            constraintsContainer.appendChild(tr1);
            constraintsContainer.appendChild(tr2);
            //todo: make the image size slider increment discretely, depending on the available dimensions of the images
            // Sliders

            return constraintsContainer;
        })();

        var satCondLabel = createElement(`<label id="satCondLabel">Images satisfying conditions: 0</label>`);

        // == creating buttons ==

        const btn_dispOgs = createGButton('dispOgsBtn', 'Display <u>o</u>riginals', function () {
            showImages.displayImages();
        });
        const btn_animated = createGButton('AnimatedBtn', '<u>A</u>nimated', function () {
            q('#itp_animated').firstElementChild.click();
        });
        const btn_preload = createGButton('preloadBtn', 'Preload images ↻', function () {
            const imgLinks = Array.from(qa('a.rg_l[href]'));
            console.log('imgLinks:', imgLinks);

            for (const a of imgLinks) {
                const img = a.querySelector('img');
                const dlName = cleanGibberish(getMeta(img)['pt']);

                img.setAttribute('download-name', dlName);
                img.alt = dlName;
                // ImageManager.markImageOnLoad(img, a.getAttribute('href'));
                console.log('Preloading image:', `"${dlName}"`, !isBase64ImageData(img.src) ? img.src : 'Base64ImageData');
            }
        });
        const btn_downloadJson = createGButton('dlJsonBtn', 'Download JSON {}', downloadJSON);
        const btn_trimSiteLeft = createGButton('trimSiteLeft', '[', siteSearch_TrimLeft);

        const btn_download = createGButton('downloadBtn', 'Download ⇓', downloadImages);
        btn_download.style.margin = '20px';
        btn_download.style.border = '20px';
        btn_download.innerHTML = cbox_ZIP.checked ? 'ZIP&nbsp;images' : `Download&nbsp;⇓`;

        var downloadPanel = createElement('<div id="download-panel" style="display: block;"></div>');

        // Appending buttons to downloadPanel
        for (const el of [cbox_ZIP, btn_download, btn_preload, btn_downloadJson, constraintsContainer]) {
            downloadPanel.appendChild(el);
        }

        // todo: append the element somewhere else, where it will also be appended with the web search (not only the image search)
        // search engine dropdown
        const searchEngineSelect = createElement(`<select id="search-engine-select">
    <option id="google-search">Google</option>
    <option id="yandex-search">Yandex</option>
    <option id="ddg-search">DuckDuckGo</option>
</select>`);
        searchEngineSelect.onchange = function (e) {
            const query = new URL(location.href).searchParams.get('q');
            switch (searchEngineSelect.value.toLowerCase()) {
                case 'yandex':
                    location.assign('https://yandex.com/images/search?text=' + encodeURIComponent(query));
                    break;
                case 'duckduckgo':
                    location.assign('https://duckduckgo.com/?&kao=-1&kp=-2&k1=-1&kak=-1&atb=v50-4&t=hf&iax=images&ia=' + (/&tbm=isch/.test(location.href) ? 'images' : 'web') + '&q=' + encodeURIComponent(query));
                    break;
            }
        };

        /** contains the current download path, changing it will change the download path */
        var defaultDownlodPath = '';
        var pathBox = createElement(`<div class="sg" style="display: inline;"> <input id="download-path" value="${defaultDownlodPath}"><label>Download path</label> </div>`);

        const divider = document.createElement('div');
        controlsContainer.appendChild(divider);

        // appending buttons and controls
        divider.after(btn_dispOgs, cbox_ShowFailedImages, cbox_GIFsOnly, cbox_UseDdgProxy, cbox_GIFsException, cbox_OnlyShowQualifiedImages, btn_animated, searchEngineSelect, pathBox, downloadPanel);
        constraintsContainer.after(satCondLabel);
        downloadPanel.appendChild(createElement(`<div id="progressbar-container"></div>`));
    }

    /**
     * clears the selection effects (when filtering and choosing images)
     */
    function clearAllEffects() { // remove highlighting of elements
        console.warn('clearAllEffects()');
        for (const effectClassName of ['highlight', 'drop-shadow', 'transparent', 'sg-too-small', /*'qualified-dimensions',*/ 'sg-too-small-hide', 'in']) {
            for (const el of document.getElementsByClassName(effectClassName)) {
                el.classList.remove(effectClassName);
                el.classList.add('out');
            }
        }
    }

    /**
     * Returns a list of qualified image metas
     * @return {Meta[]}
     */
    function getQualifiedUblImgMetas() {
        const condition = meta => !(meta.imgEl.classList.contains(Consts.ClassNames.FAILED) || meta.imgEl.classList.contains(Consts.ClassNames.FAILED_DDG) // not marked as failed
            && meta && Math.max(meta.ow, meta.oh) >= 120); // not too small;

        return Array.from(getImgBoxes(' a.rg_l img[loaded="true"], a.rg_l img[loaded="true"]'))
            .map(getMeta)
            .filter(condition);
    }

    function downloadImages() {
        const zipBox = q('#zipInsteadOfDownload');
        if (zipBox && zipBox.checked) {
            if (!zip || Object.keys(zip.files).length < 1) {
                gZipImages();
            } else {
                genZip();
            }
        } else {
            if (currentDownloadCount >= q('#dlLimitSlider').value) {
                currentDownloadCount = 0;
            } else {
                console.log('currentDownloadCount >= dlNumSlider.value');
            }
            const qualifiedGImgs = Array.from(getQualifiedGImgs());
            let i = 0;
            const downloadInterval = setInterval(function () {
                if (i < qualifiedGImgs.length) {
                    download(
                        qualifiedGImgs[i].fileURL,
                        qualifiedGImgs[i].fileName,
                        '${location.hostname} ${document.title}',
                        {
                            element: qualifiedGImgs[i]
                        }
                    );
                    currentDownloadCount++;
                    i++;
                } else {
                    clearInterval(downloadInterval);
                }
            }, 300);
        }
    }

    /**
     * @returns {Set<{fileURL: string, fileName: string, img: HTMLImageElement}>}
     * to get images that only satisfy the dimensions condition:    getQualifiedGImgs(null, null, true)
     * @param imgs
     * @param exception4smallGifs
     * @param ignoreDlLimit
     */
    function getQualifiedGImgs(imgs, exception4smallGifs, ignoreDlLimit) {
        var ogs = [];
        if (typeof imgs === 'object'
            && imgs.hasOwnProperty('ogs')
            && imgs.hasOwnProperty('exception4smallGifs')
            && imgs.hasOwnProperty('ignoreDlLimit')
        ) {
            ogs = imgs.ogs;
            exception4smallGifs = imgs.exception4smallGifs;
            ignoreDlLimit = imgs.ignoreDlLimit;
        }
        ogs = ogs.length <= 0 ? qa('img.rg_ic.rg_i') : ogs;

        const minImgSizeSlider = q('#minImgSizeSlider');
        const dlLimitSlider = q('#dlLimitSlider');

        const minImgSize = minImgSizeSlider ? minImgSizeSlider.value : 0;
        const dlLimit = dlLimitSlider ? dlLimitSlider.value : 0;
        const qualImgs = new Set();

        for (const img of ogs) {
            try {
                const fileName = img.getAttribute('download-name') || img.alt;

                if (zip.file(fileName))
                    continue;

                const meta = getMeta(img);
                const fileURL = meta.ou;
                const w = meta.ow;
                const h = meta.oh;

                // adding new property names to the img object
                img['fileURL'] = fileURL;
                img['fileName'] = fileName;
                img['meta'] = meta;

                const isBig = w >= minImgSize || h >= minImgSize;
                const qualDim = isBig || exception4smallGifs && /\.gif\?|$/i.test(fileURL);
                const underDlLimit = qualImgs.size < dlLimit;

                if (qualDim && (ignoreDlLimit || underDlLimit)) {
                    qualImgs.add(img);
                }
            } catch (e) {
                console.warn(e);
            }
        }
        return qualImgs;
    }


    /**
     * occumulates the unblocked site hostnames to the global `ublSitesSet`
     * @return {Meta[]} the added sites
     */
    function collectUblSites() {

        function extractUblHostname(imgMeta) {
            let hostname = getHostname(imgMeta.src);

            if (/tumblr\.com/.test(hostname))
                hostname = hostname.replace(/^\d+?\./, '');

            if (/google|gstatic/i.test(hostname)) {
                hostname = getHostname(imgMeta.ru);
            }

            return hostname;
        }

        const added = Array.from(getQualifiedUblImgMetas()).map(extractUblHostname).filter(x => !!x);
        ublSitesSet.addAll(added);
        return added;
    }
    function storeUblSitesSet() {
        collectUblSites();
        const stored = GM_getValue(Consts.GMValues.ublSites, []);
        const merged = new Set(
            [].slice.call(stored)
                .concat(Array.from(ublSitesSet))
        );


        const diff = Array.from(ublSitesSet).filter(x => Array.from(stored).indexOf(x) < 0);
        GM_setValue(Consts.GMValues.ublSites, Array.from(merged));

        console.log('Found new unblocked sites:', diff);
        return ublSitesSet;
    }

    /**
     * Deletes unwanted properties of the meta object (the object containing)
     * @param {Meta} meta - the meta is mutated
     * @return {Meta|Object} the same object is returned for convenience
     */
    function cleanMeta(meta) {
        if (!meta)
            return ({});

        for (const prop of ['clt', 'cl', 'cb', 'cr', 'sc', 'tu', 'th', 'tw', 'rh', 'rid', 'rt', 'itg', 'imgEl'])
            if (meta.hasOwnProperty(prop))
                delete meta[prop];

        return meta
    }

    function storeUblMetas() {
        ublMetas.addAll(getQualifiedUblImgMetas());

        const stored = new Set(GM_getValue(Consts.GMValues.ublUrls, new Set()));
        ublMetas.addAll(stored);

        console.debug(
            'stored ublURLs:', stored,
            '\nnew ublURLs:', ublMetas
        );

        // store
        GM_setValue(Consts.GMValues.ublUrls, Array.from(ublMetas).map(cleanMeta));

        return ublMetas;
    }
    function storeUblMap() {
        for (const imgMeta of getQualifiedUblImgMetas()) {
            ublMap.addURL(imgMeta.src, imgMeta.imgEl.loaded === true || imgMeta.imgEl.loaded === 'ddgp', {
                imgEl: imgMeta.imgEl,
                dimensions: (imgMeta.ow + 'x' + imgMeta.oh)
            });
        }

        const stored = new Map(GM_getValue(Consts.GMValues.ublSitesMap, new Map()));
        for (const [k, v] of stored) {
            ublMap.addURL(k, v);
        }
        console.debug(
            'stored map:', stored,
            '\nnew ublMap:', ublMap
        );

        GM_setValue(Consts.GMValues.ublSitesMap, Array.from(ublMap.entries()));
        return ublMap;
    }

    /** @param selector
     * @return {NodeListOf<Node>|null}*/
    function qa(selector) {
        return document.querySelectorAll(selector);
    }
    /** @param selector
     * @return {HTMLElement|null} */
    function q(selector) {
        return document.querySelector(selector);
    }

    function clickLoadMoreImages() {
        // click "Load more images"
        let el = q('#smb');
        if (!el) return;
        var bodyRect = document.body.getBoundingClientRect(),
            elemRect = el.getBoundingClientRect(),
            offset = (bodyRect.bottom - elemRect.bottom);
        if (el && (offset < screen.height + 200)) {
            console.log('clicked LoadMoreImages');
            el.click();
        }
    }
    /**
     * Called every 20 or so images, the image boxes are passed
     * @param addedImageBoxes
     */
    function onImageBatchLoading(addedImageBoxes) {
        console.log('onImageBatchLoading()');
        // if (imageSet.contains(addedImageBoxes)) return;
        // else imageSet.add(addedImageBoxes);

        for (const imageBox of addedImageBoxes) {
            imageBox.classList.add('rg_bx_listed');
            addImgExtensionBox(imageBox);
            addImgDownloadButton(imageBox);

            const img = imageBox.querySelector('img.rg_i');

            img.setAttribute('alt', getGimgDescription(img));
            img.setAttribute('download-name', getGimgDescription(img));
            // markImageOnLoad(img, img.closest('a').href);
        }

        (function updateDlLimitSliderMax() {
            const dlLimitSlider = q('#dlLimitSlider');
            if (dlLimitSlider) {
                const tmpValue = dlLimitSlider.getAttribute('value');
                const numImages = getImgBoxes().length;
                dlLimitSlider.setAttribute('max', numImages.toString());

                const newValue = Math.min(numImages, parseFloat(tmpValue));
                dlLimitSlider.setAttribute('value', newValue.toString());
                const sliderValueEl = q('#dlLimitSliderValue');
                if (sliderValueEl) sliderValueEl.setAttribute('value', newValue.toString());
            }
        })();

        /**
         * Adds a mouseover listener so the image will be replaced with it's original if you hover over an image for a moment
         */
        (function addHoverListener() {
            let pageX = 0;
            let pageY = 0;


            for (const bx of addedImageBoxes) {
                let timeout = null;
                const checkAndResetTimer = e => {
                    if (!(pageX === e.pageX && pageY === e.pageY)) {
                        // console.log(`mouse has moved, is: (${e.clientX}, ${e.clientY}) was: (${pageX}, ${pageY})`);
                        clearTimeout(timeout);
                    }
                };
                const replaceWithOriginal = (e) => {
                    checkAndResetTimer(e);
                    showImages.replaceImgSrc(bx.querySelector('img'), bx.querySelector('a'));
                };

                const onMouseUpdate = (e) => {
                    checkAndResetTimer(e);
                    timeout = setTimeout(() => replaceWithOriginal(e), 250);
                    bx.mouseX = e.clientX;
                    bx.mouseY = e.clientY;
                };
                bx.addEventListener('mousemove', onMouseUpdate, false);
                bx.addEventListener('mouseenter', onMouseUpdate, false);

                bx.addEventListener('mouseout', (e) => {
                    clearTimeout(timeout);
                });
            }
        })();

        try {
            updateQualifiedImagesLabel();
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * @param {HTMLImageElement} img
     * @return {string}
     */
    function getGimgDescription(img) {
        let meta = getMeta(img);
        let title = meta.pt,
            desc = meta.s;
        return title + '_' + desc; // choosing one of them (prioritizing the description over the title)
    }

    /**
     * @param imageElement image element, either <img class="rg_ic rg_i" ....> in .rg_bx
     * todo: make this function detect if the image is a thumbnail or inside the panel, also make it work by getting the "id" and finding the meta through that
     * @param minified
     * @return {Meta}
     */
    function getMeta(imageElement, minified = false) {
        var metaObj = {};
        if (!imageElement)
            return metaObj;

        try {
            metaObj = JSON.parse(getMetaText(imageElement));

            metaObj.src = imageElement.src;
            metaObj.dim = [metaObj.ow, metaObj.oh];
            metaObj.imgEl = imageElement;

            if (minified)
                cleanMeta(metaObj);
        } catch (e) {
            console.warn(e, imageElement);
        }

        /** @param img
         * @return {string} */
        function getMetaText(img) {
            //[Google.com images]
            /** @param thumbnail
             * @return {HTMLDivElement } */
            const getMetaEl = thumbnail => {
                const div = thumbnail.tagName === 'DIV' ? thumbnail :
                    thumbnail.closest('div.rg_bx, div.irc_rimask');// nearest parent div container, `div.rg_bx` for thumbnails and `div.irc_rimask` for related images
                return div.querySelector('.rg_meta');
            }; // look for div.rg_meta, that should have the meta data

            try {
                return getMetaEl(img).innerText;
            } catch (e) {
                console.error('Error while getting metaText', e, img);
            }
            return '{}';
        }

        return metaObj;
    }

    /*window.onbeforeunload = function (e) { // on tab exit
        ublSites = new Set(ublSites, GM_getValue('unblocked sites of og images'));
        console.log('ublSites:', ublSites);
        GM_setValue('unblocked sites of og images', Array.from(ublSites));
        var message = "Saving unblocked sites (confirmation).", e = e || window.event;
        // For IE and Firefox
        if(e) {
            e.returnValue = message;
        }
        // For Safari
        return message;
    };*/

    function saveUblSites() {
        storeUblSitesSet();
        console.log('Site links of unblocked images:', Array.from(ublSitesSet));
    }

    /**
     * cross-browser wheel delta
     * Returns the mousewheel scroll delta as -1 (wheelUp) or 1 (wheelDown) (cross-browser support)
     * @param {MouseWheelEvent} wheelEvent
     * @return {number} -1 or 1
     */
    function getWheelDelta(wheelEvent) {
        // cross-browser wheel delta
        wheelEvent = window.event || wheelEvent; // old IE support
        return Math.max(-1, Math.min(1, (wheelEvent.wheelDelta || -wheelEvent.detail)));
    }

    //todo: rather than clicking the image when it loads, just set the className to make it selected: ".irc_rist"
    /**
     * keeps on trying to press the bottom related image (the last one to the bottom right) until it does.
     * @param interval  the interval between clicks
     */
    function tryToClickBottom_ris_image(interval = 30) {
        isTryingToClickLastRelImg = true; // set global flag to true (this is to prevent the scroll handler from ruining this)

        var timeout = null;
        const recursivelyClickLastRelImg = function () {
            console.log('recursivelyClickLastRelImg()');
            timeout = setTimeout(function tryToClick() {
                const risLast = ImagePanel.focP.ris_DivLast;
                if (risLast && risLast.click) {
                    risLast.click();
                    isTryingToClickLastRelImg = false;
                    clearTimeout(timeout);
                    console.log('finally clicked the last related img:', risLast);
                } else {
                    recursivelyClickLastRelImg();
                }
            }, interval);
        };
        recursivelyClickLastRelImg();

        while (!isTryingToClickLastRelImg) {
            // polling
            console.log('waiting to be done...');
        }
    }

    /**
     * Navigates to the previous related image in the irc_ris in the main panel.
     * @return {boolean} returns true if the successful (no errors occur)
     */
    function prevRelImg() {
        try {
            const panel = ImagePanel.focP;
            if (!panel.ris_fc_Div) return false;
            let previousElementSibling = panel.ris_fc_Div.previousElementSibling;

            if (!!previousElementSibling) {
                previousElementSibling.click();
            } else if (Preferences.loopbackWhenCyclingRelatedImages) {
                const relImgsOnly = Array.from(panel.ris_Divs);// List of relImgs without that last "View More".

                const endRis = relImgsOnly.pop();
                endRis.click();
            } else {
                ImagePanel.previousImage();
                tryToClickBottom_ris_image(30);
            }


            /* // if the image hasn't loaded (doesn't appear), then just go to the one after it
             try {
                 const siblingImg = panel.ris_fc_Div.querySelector('img');
                 if (siblingImg && siblingImg.getAttribute('loaded') == 'undefined') {
                     console.debug('siblingImg.loaded = ', siblingImg.getAttribute('loaded'));
                     return prevRelImg()
                 }
             } catch (e) {
             }*/
            return true;
        } catch (e) {
            console.warn(e);
        }
    }
    /**
     * Navigates to the next related image in the irc_ris in the main panel.
     * @return {boolean} returns true if the successful (no errors occur)
     */
    function nextRelImg() {
        try {
            const panel = ImagePanel.focP;
            const ris_fc_Div = panel.ris_fc_Div;
            if (!panel.ris_fc_Div) {
                return false;
            }
            let nextElSibling = ris_fc_Div.nextElementSibling;
            if (nextElSibling && !nextElSibling.classList.contains('irc_rismo')) {
                nextElSibling.click();
            } else if (Preferences.loopbackWhenCyclingRelatedImages) {
                Array.from(panel.ris_DivsAll)[0].click();
                console.debug('clicking first irc_irs to loop, cuz there isn\'t any on the right', panel.ris_DivsAll[0]);
            } else {
                ImagePanel.nextImage();
            }

            return true;
        } catch (e) {
            console.warn(e);
        }
    }

    function toggleEncryptedGoogle(doNotChangeLocation) {
        console.log('Toggle encrypted google');
        const onEncrGoogle = new RegExp('encrypted\\.google\\.com').test(location.hostname);

        var targetURL;

        targetURL = location.href;
        targetURL = !onEncrGoogle ?
            targetURL.replace(/www\.google\.[\w.]+/i, 'encrypted.google.com') :
            targetURL.replace(/encrypted\.google\.[\w.]+/i, 'www.google.com');
        console.log('Target URL:', targetURL);
        if (!doNotChangeLocation)
            location.assign(targetURL);
        return targetURL;
    }

    function parseSearchBarString(str) {
        if (!str)
            str = document.querySelector('input[type="text"][title="Search"]').value;

        const regex = /(\w*)(\s|^)(site:)?(\w+:\/\/)*([\w.]+)([\w.\/]*)([^\s]*)\s?(.*)/;
        let m;
        let prs = {};

        prs.leftQuery = '';
        prs.siteStr = '';
        prs.protocol = '';
        prs.hostname = '';
        prs.path = '';
        prs.urlParams = '';
        prs.rightQuery = '';

        if ((m = regex.exec(str)) !== null) {
            prs.match = m;
            prs.leftQuery = m[1] || '';
            prs.siteStr = m[3] || '';
            prs.protocol = m[4] || '';
            prs.hostname = m[5] || '';
            prs.path = m[6] || '';
            prs.urlParams = m[7] || '';
            prs.rightQuery = m[8] || '';
        }

        prs.trimPathRight = () => {
            prs.path = prs.pathSplit.slice(0, -1).join('/');
            return prs;
        };

        prs.trimHostLeft = () => {
            if (prs.hostnameSplit.length > 2) {
                prs.hostname = prs.hostnameSplit.slice(1).join('.');
                return prs;
            }
        };

        prs.trimRight = () => {
            if (prs.urlParams) {
                prs.urlParams = '';
            } else if (prs.path) {
                prs.trimPathRight();
            }
            return prs;
        };

        prs.trimLeft = () => {
            if (prs.protocol) {
                prs.protocol = '';
            } else if (prs.hostnameSplit.length > 2) {
                prs.trimHostLeft();
            } else if (prs.siteStr) {
                prs.siteStr = '';
            }
            return prs;
        };

        prs.toString = () => [
            !prs.leftQuery ? '' : prs.leftQuery + ' ',
            prs.siteStr, prs.protocol, prs.hostname, prs.path, prs.urlParams,
            !prs.rightQuery ? '' : ' ' + prs.rightQuery,
        ].join('');

        prs.__defineGetter__('hostnameSplit', () => prs.hostname.split('.'));
        prs.__defineGetter__('pathSplit', () => prs.path.split('/'));

        return prs;
    }
    /**
     * if there's a 'site:' keyword in the search, this will trim it to a larger domain:
     * thumbnails.example.com -> .example.com
     */
    function siteSearch_TrimLeft() {
        const searchBox = q(Consts.Selectors.searchBox);

        const trimmedSiteSearch = parseSearchBarString(searchBox.value).trimLeft();

        console.log(`siteSearch_TrimLeft("${searchBox.value}") = "${trimmedSiteSearch}"`);

        if (searchBox.value === trimmedSiteSearch) {// don't change if already the same
            return;
        }

        searchBox.value = trimmedSiteSearch;
        searchBox.form.submit();
    }

    function siteSearch_TrimRight() {
        const searchBox = q(Consts.Selectors.searchBox);

        // for regex breakdown, see https://regex101.com/r/gq9In1/1
        const trimmedSiteSearch = parseSearchBarString(searchBox.value).trimRight();
        console.log(`siteSearch_TrimRight("${searchBox.value}") = "${trimmedSiteSearch}"`);

        if (searchBox.value === trimmedSiteSearch) {// don't change if already the same
            return;
        }
        searchBox.value = trimmedSiteSearch;
        searchBox.form.submit();
    }

    function openInTab(url, target) {
        window.open(url, target || '_blank');
    }
    function cleanDates(str) {
        return !str ? str : removeDoubleSpaces(str.replace(/\d+([.\-])(\d+)([.\-])\d*/g, ' '));
    }
    function cleanSymbols(str) {
        return !str ? str : removeDoubleSpaces(
            cleanDates(str)
                .replace(/[-!$%^&*()_+|~=`{}\[\]";'<>?,.\/]/gim, ' ')
                .replace(/\.com|#|x264|DVDRip|720p|1080p|2160p|MP4|IMAGESET|FuGLi|SD|KLEENEX|BRRip|XviD|MP3|XVID|BluRay|HAAC|WEBRip|DHD|rartv|KTR|YAPG/gi, ' ')
        ).trim();
    }
    /**
     * @param selectorExtension {string}: optional: extend the selector (useful for selecting things inside the img box)
     * example: getImgBoxes(' img') will return the images inside that those image boxes
     * @return {NodeListOf<HTMLDivElement>|NodeListOf<*>}
     */
    function getImgBoxes(selectorExtension = '') {
        return document.querySelectorAll('#rg_s > .rg_bx' + selectorExtension);
    }
    function getImgAnchors(selectorExtension = '') {
        // return qa('#rg_s > div.rg_bx > a.rg_l[href]');
        return getImgBoxes(' > a[href]', selectorExtension);
    }

    function updateDownloadBtnText() {
        const downloadBtn = q('#downloadBtn');
        const zipCbox = q('#zipInsteadOfDownload');
        if (zipCbox && downloadBtn) {
            downloadBtn.innerHTML = zipCbox.checked ?
                (!downloadBtn.classList.contains('genzip-possible') ? 'ZIP' : 'Download&nbsp;ZIP&nbsp;⇓') : // "zip" or "download zip"
                'Download&nbsp;⇓';
        }
    }

    /**
     * @param minified: delete unneeded meta attributes?
     * @returns {Array} an array containing the meta objects of the images
     */
    function getResultsData(minified = true) {
        let imgBoxes = getImgBoxes();
        let set = new Set();
        for (let box of imgBoxes) {
            var img;
            var meta = {};

            try {
                img = box.querySelector('img');
                meta = getMeta(img, minified);
                meta.loaded = img.getAttribute('loaded');

                if (minified) {
                    cleanMeta(meta);
                }
            } catch (e) {
                console.warn(e, box);
                continue;
            }
            if (meta == null) continue;
            set.add(meta);
        }
        return Array.from(set);
    }

    function downloadJSON() {
        let text = getResultsJSON({
            minify: true,
            stringify: true,
            base64urls: false
        });
        let name = 'GImg data_' + document.title;
        anchorClick(makeTextFile(text), name + '.json');
    }

    /**
     * @param {Object} [options={}]
     * @param {boolean} [options.minify=true]
     * @param {boolean} [options.stringify=false]
     * @param {boolean} [options.base64urls=true]
     * @returns {{ title:{string}, url:{string}, search:{string}, time:{string}, data:Array }}
     */
    function getResultsJSON(options = {}) {
        options = $.extend({
            minify: true,
            stringify: false,
            base64urls: true
        }, options);

        const metas = getResultsData();

        if (options.base64urls === false) {
            for (const meta of metas) {
                for (const prop of ['src', 'imgSrc']) {
                    if (meta.hasOwnProperty(prop)) {
                        if (isBase64ImageData(meta[prop]))
                            meta[prop] = meta[prop].split(',')[0];
                    }
                }
            }
        }

        const o = {
            'title': document.title,
            'url': location.href,
            'search': GoogleUtils.elements.searchBox.value,
            'time': new Date().toJSON(),
            'data': metas
        };
        return options.stringify ? JSON.stringify(o, null, 4) : o;
    }

    function getIndexHtml() {
        return Array.from(getImgBoxes()).map(bx => {
            const meta = getMeta(bx);
            return `<div>
<img src="${meta.ou}" class="src-img" alt="${meta.pt}">
	<div>
    <a href="${meta.ru}" target="_blank">${meta.ru}</a>
    <h3>${meta.pt} ${meta.st}</h3>
    <h4>${meta.s}</h4>
	</div>
</div>`;
        }).join('\n');
    }

    /**
     * adds an attribute "load" indicating the load status
     *  load = "true":      image loaded successfully
     *  load = "loading":     image still loading
     *  load = "error":     image failed to load
     * @param imgUrl
     * @param imgEl
     */
    function markImageOnLoad(imgEl, imgUrl) {
        if (!imgEl) return;
        imgUrl = !!imgUrl ? imgUrl : imgEl.src;
        if (imgEl.getAttribute('loaded') === 'loading') {
            return;
        }

        var imgObj = new Image();
        imgEl.setAttribute('loaded', 'loading');
        imgObj.onerror = function () {
            imgEl.setAttribute('loaded', 'error');
            console.debug('onerror:', imgEl);
        };
        imgObj.onload = function () {
            console.debug('onload:', imgEl);
            imgEl.setAttribute('loaded', 'true');
        };
        imgObj.src = imgUrl;
    }

    /**
     * This is the URL with safe search off
     * @returns false if the page is already with "safe search" off
     * @deprecated
     */
    function safeSearchOffUrl() {
        var safeSearchButton = q('#ss-bimodal-default');
        if (safeSearchButton) return safeSearchButton.href;
    }

    const responseBlobs = new Set();

    function setupProgressBar() {
        // noinspection JSUnresolvedVariable
        if (typeof (ProgressBar) == 'undefined') {
            console.warn('ProgressBar is not defined.');
            return;
        }
        if (!q('#progressbar-container'))
            document.body.firstElementChild.before(createElement(`<header id="progressbar-container" style="
    position: fixed !important;
    top: 0;
    left: 0;
    width: 100%;
    min-height: 30px;
    padding: 10px 0;
    background-color: #36465d;
    box-shadow: 0 0 0 1px hsla(0,0%,100%,.13);
    z-index: 100;"
/>`));

        // noinspection JSUnresolvedVariable
        // noinspection ES6ModulesDependencies
        var progressBar = new ProgressBar.Line('#progressbar-container', {
                easing: 'easeInOut',
                color: '#FCB03C',
                strokeWidth: 1,
                trailWidth: 1,
                text: {
                    value: '0',
                    alignToBottom: false
                },

                trailColor: '#eee',
                duration: 1400,
                svgStyle: null
            }
        );
        console.log('progressBar:', progressBar);
        progressBar.set(0);
        const progressbarText = q('.progressbar-text');
        progressbarText.style.display = 'inline';
        progressbarText.style.position = 'relative';
        return progressBar;
    }

    function zipBeforeUnload(e) {
        var dialogText = 'You still didn\'t download your zipped files, are you sure you want to exit?';
        e.returnValue = dialogText;
        return dialogText;
    }
    function gZipImages() {
        zip = zip || new JSZip();
        zip.current = 0;
        zip.totalSize = 0;
        zip.totalLoaded = 0;
        zip.file('info.json', new Blob([getResultsJSON({
            minify: true,
            stringify: true,
            base64urls: false
        })], {type: 'text/plain'}));

        window.addEventListener('beforeunload', zipBeforeUnload);
        window.onunload = genZip;
        const selector = 'img.rg_ic.rg_i'
            // `.${TOKEN_DISPLAY}[loaded^="true"], .img-big`
            // '.rg_ic.rg_i.display-original-mainImage:not(.display-original-mainImage-failed)'
        ;
        /** type {HTMLAnchorElement} */
        const ogs = qa(selector);


        const qualImgs = getQualifiedGImgs(ogs, null, q('#GIFsExceptionBox').checked);
        zip.zipTotal = qualImgs.size;

        progressBar = setupProgressBar();

        console.debug('Original images to be downloaded:', ogs);
        let activeZipThreads = 0;

        for (const qualifiedImgArgs of qualImgs) {
            requestAndZipImage(qualifiedImgArgs.fileURL, qualifiedImgArgs.fileName, qualifiedImgArgs.img);
        }
        /**
         * Takes a name and returns the same name and iterates it if it already exists in the zip
         * @param fname
         * @return {string}
         */
        function getValidIteratedName(fname) {
            if (!zip.file(fname)) {
                return fname;
            } else {
                var numberStr = (fname).match(/\d+/g);
                var newName = fname;
                if (numberStr) {
                    numberStr = numberStr.pop();
                    var number = parseInt(numberStr);
                    newName = fname.replace(numberStr, ++number)
                } else {
                    var split = newName.split('.');
                    newName = split.slice(0, -1).join('.') + (' 1.') + split.slice(-1);
                }
                return getValidIteratedName(newName);
            }
        }

        function requestAndZipImage(fileUrl, fileName, img) {
            let fileSize = 0,
                loadedLast = 0
            ;
            activeZipThreads++;
            const meta = getMeta(img);

            fileName = getValidIteratedName(removeDoubleSpaces(fileName.replace(/\//g, ' ')));

            function onBadResult(res) {
                console.debug('onBadResult:', 'fileURL:', fileUrl, 'response.finalURL:', res.finalUrl);

                if (!PProxy.DDG.test(res.finalUrl)) {
                    console.debug(
                        'retrying with ddgproxy',
                        '\nddgpURL:', PProxy.DDG.proxy(fileUrl),
                        '\nfileURL:', fileUrl,
                        '\nresponse.finalURL:', res.finalUrl
                    );

                    if (/<!DOCTYPE/.test(res.responseText)) {
                        console.error('Not image data!', res.responseText);
                        zip.current++;
                        return;
                    }
                    requestAndZipImage(PProxy.DDG.proxy(fileUrl), fileName, img);
                } else {
                    return true;
                }
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: fileUrl || 'https://i.ytimg.com/vi/RO90omga8D4/maxresdefault.jpg',
                responseType: 'arraybuffer',
                binary: true,
                onload: res => {
                    if (zip.file(fileName)) {
                        return;
                    }
                    try {
                        /* 
                        console.debug(
                            `onload:
    readyState: ${res.readyState}
    respHeaders: ${res.responseHeaders}
    status:     ${res.status}
    statusText: ${res.statusText}
    finalUrl:   ${res.finalUrl}
    respText:   ${res.responseText.slice(0, 100)}...`
                        ); */
                    } catch (e) {
                    }

                    const [t, fullMatch, mimeType1, mimeType2] = res.responseHeaders.match(/(content-type: )([\w]+)\/([\w\-]+)/);
                    const contentType = [mimeType1, mimeType2].join('/');
                    let ext = mimeTypesJSON.hasOwnProperty(contentType) && mimeTypesJSON[contentType] ?
                        mimeTypesJSON[contentType].extensions[0] :
                        mimeType2;
                    console.debug(fullMatch);
                    const wrongMime = !/image/i.test(mimeType1),
                        isDoctype = /<!DOCTYPE html PUBLIC/.test(res.responseText);

                    if (wrongMime) {
                        console.log('wrongMime type but continueing to download it:', contentType);
                        ext = 'gif';
                    }
                    if (isDoctype) {
                        console.error(
                            'Not image data!: ',
                            isDoctype ?
                                'matches "<!DOCTYPE html PUBLIC"' :
                                wrongMime ? `Wrong mime: ${contentType}` :
                                    'idk',
                            '\n' + fileUrl,
                            `${res.responseText.slice(0, 100)}...`
                        );
                        if (onBadResult(res) || isDoctype) {
                            return;
                        }
                    }
                    var blob = new Blob([res.response], {type: contentType});

                    responseBlobs.add(blob);
                    zip.file(`${fileName}.${ext || 'image/gif'}`, blob, {
                            comment: JSON.stringify({
                                url: fileUrl,
                                name: `${meta.pt} ${meta.st}`,
                                page: meta.ru
                            }, null, 4)
                        }
                    );
                    console.log('Added file to zip:', fileName, fileUrl);
                    zip.current++;

                    // fixing the download button text
                    q('#downloadBtn') && q('#downloadBtn').classList.add('genzip-possible');
                    updateDownloadBtnText();


                    if (zip.current < zip.zipTotal || zip.zipTotal <= 0) {
                        return;
                    }

                    if (zip.current >= zip.zipTotal - 1) {
                        console.log('Generating ZIP...', '\nFile count:', Object.keys(zip.files).length);
                        zip.zipTotal = 0;
                        progressBar.destroy();
                        genZip();
                    }
                    activeZipThreads--;
                },
                onreadystatechange: res => {
                    // console.debug('Request state changed to: ' + res.readyState);
                    if (res.readyState === 4) {
                        console.debug('ret.readyState === 4');
                    }
                },
                onerror: res => {
                    if (onBadResult(res)) {
                        return;
                    }
                    console.error('An error occurred.' +
                        '\nreadyState: ' + res.readyState +
                        '\nresponseHeaders: ' + res.responseHeaders +
                        '\nstatus: ' + res.status +
                        '\nstatusText: ' + res.statusText +
                        '\nfinalUrl: ' + res.finalUrl +
                        '\nresponseText: ' + res.responseText
                    );
                    activeZipThreads--;
                },
                onprogress: res => {
                    if (zip.file(fileName) || zip.current < zip.zipTotal || zip.zipTotal <= 0) {
                        //TODO: stop the GM_xmlrequest at this point

                        /*if(res.abort)
                            res.abort();
                        else
                            console.error('res.abort not defined');
                        if(this.abort)
                            this.abort();
                        else
                            console.error('this.abort not defined');
                        return;*/
                    }

                    if (res.lengthComputable) {
                        if (fileSize === 0) { // happens once
                            fileSize = res.total;
                            zip.totalSize += fileSize;
                        }
                        const loadedSoFar = res.loaded;
                        const justLoaded = loadedSoFar - loadedLast;    // What has been added since the last progress call
                        const fileprogress = loadedSoFar / res.total;

                        zip.totalLoaded += justLoaded;
                        const totalProgress = zip.totalLoaded / zip.totalSize;

                        if (false) {
                            console.debug(`loadedSoFar = ${res.loaded}\njustLoaded = ${loadedSoFar - loadedLast}\nfileprogress = ${loadedSoFar / res.total}`);
                        }
                        if (progressBar) {
                            progressBar.set(totalProgress);
                            progressBar.setText(`Files in ZIP: (${Object.keys(zip.files).length} / ${zip.zipTotal}) Active threads: ${activeZipThreads}     (${zip.totalLoaded} / ${zip.totalSize})`);
                        }

                        loadedLast = loadedSoFar;
                    }
                }
            });
        }

        return zip;
    }

    function unionTitleAndDescr(str1, str2) {
        if (!str1) return str2;
        if (!str2) return str1;
        var regex = new RegExp(str2.match(RegExp('[^$-/:-?{-~!"^_\\`\\[\\]]+', 'g')).join('|'), 'gi');
        var str1MinusStr2 = str1.replace(regex, ' ');
        return removeDoubleSpaces(str1MinusStr2 + ' ' + str2);
    }
    function unionStrings(str1, str2) {
        var words1 = str1.split(/\s+/g),
            words2 = str2.split(/\s+/g),
            resultWords = [],
            i,
            j;

        for (i = 0; i < words1.length; i++) {
            for (j = 0; j < words2.length; j++) {
                if (words1[i].toLowerCase() === words2[j].toLowerCase()) {
                    console.log('word ' + words1[i] + ' was found in both strings');
                    resultWords.push(words1[i]);
                }
            }
        }
        return resultWords.join(' ');
    }


    /**
     * Sets the hides/shows the images that match the filter
     * @param visibility: the new visibility for images matching `filter`
     * @param filter: {(imgBox) -> bool | string};
     *  A function or string (CSS selector) to test the condition for each image.
     *  A function that is passed each image, and should return a boolean.
     *  True to set it to the visibility value, otherwise will be set depending on `invertVisibilityForNegativeMatches`
     * @param invertVisibilityForNegativeMatches: Set the visibility of negative matches to `!visibility`. Default: false
     * @param negateCondition: set to true to negate the result of the filter
     */
    function setVisibilityForImages(visibility, filter = (imgBox) => true, invertVisibilityForNegativeMatches = false, negateCondition = false) {
        // let bxs = qa(`div.rg_bx > a.rg_l > img.${Consts.ClassNames.FAILED_DDG}, div.rg_bx > a.rg_l > img.${Consts.ClassNames.FAILED}`);

        const _filter = (typeof (filter) === 'string') ?
            (el) => el.matches(filter) :
            filter;

        //debug: todo: should be removed later, these are just for debugging
        const pm = [];
        const nm = [];

        for (const imageBox of getImgBoxes(' > a.rg_l > img')) {
            if (negateCondition ^ _filter(imageBox)) {// match
                setVisible(imageBox, visibility);
                pm.push(imageBox);
            } else if (invertVisibilityForNegativeMatches) {
                setVisible(imageBox, !visibility);
                nm.push(imageBox);
            }
        }

        //debug: todo: remove later
        console.debug(
            `Set visibility of ${pm.length} images to ${visibility}:`, pm,
            `\nAnd ${nm.length} negative matches to ${visibility}:`, nm
        );
    }
    /**
     * @param {HTMLImageElement|HTMLDivElement|HTMLElement} imageElement - the image element, either the IMG itself or the imageBox (DIV element)
     * @param newVisibility
     */
    function setVisible(imageElement, newVisibility) {
        if (!imageElement) return;
        imageElement = imageElement.tagName === 'DIV' ? imageElement :
            imageElement.closest('div');

        if (newVisibility) {
            imageElement.classList.remove('hide-img');
        } else {
            imageElement.classList.add('hide-img');
        }
    }

    function underlineText(el, subStr) {
        if (!el) {
            console.error('Element not defined.');
            return;
        }
        var rx = new RegExp(subStr, 'i');
        if (rx.test(el.innerHTML)) {
            var oldInnerHTML = el.innerHTML;
            var newHTML = el.innerHTML.replace(rx, `<span class="underlineChar" style="text-decoration: underline;">${subStr}</span>`);
            el.innerHTML = newHTML;
            console.log(
                'oldInnerHTML=', oldInnerHTML,
                '\nnewHTML=', newHTML
            );
        } else console.error('Element doesn\'t contain text: ', subStr, el);
    }

    /**
     * @return an object map of menuItem name as the key, and HTMLDivElement as value
     * {key: menuItemName, value: menuItem HTMLDivElement}
     * menuItemNames = [ "all", "images", "videos", "news", "maps", "more" ]
     */
    function getMenuItems() {
        const menuItems = qa('.hdtb-mitem');
        const menuItemNames = [
            'all',
            'images',
            'videos',
            'news',
            'maps',
            'more'
        ];
        let menuItemsObj = {};

        for (const menuItem of menuItems) {
            for (const menuItemName of menuItemNames) {
                if (new RegExp(menuItemName, 'i').test(menuItem.innerText)) {
                    menuItemsObj[menuItemName] = menuItem;
                    break;
                }
            }
        }
        menuItemsObj.selected = q('.hdtb-mitem.hdtb-imb');

        console.log('menuItemsObj=', menuItemsObj);
        return menuItemsObj;
    }

    /** @return {Array} returns an array of words with the most common word in the first index */
    function getSortedWords() {
        const rx = /[\s\W,.\/\\\\-_]+/g;
        /*this is an array containing all the words of all titles and all images*/
        const wordList = Array.from(getImgBoxes()).map(bx => {
            const meta = getMeta(bx);
            try {
                return (meta.pt ? meta.pt.split(rx) : [])
                    .concat(meta.st ? meta.st.split(rx) : [])
                    .concat(meta.s ? meta.s.split(rx) : []);
            } catch (e) {
                console.error(e);
            }
        }).reduce((accumulator, currentValue) => accumulator.concat(currentValue))
            .filter(word => word && word.length > 2);

        return sortByFrequency(wordList);
    }

    //todo: make these functions in a utility class
    /** https://stackoverflow.com/a/3579651/7771202 */
    function sortByFrequency(array) {
        var frequency = {};

        for (const value of array) {
            frequency[value] = 0;
        }

        var uniques = array.filter(function (value) {
            return ++frequency[value] === 1;
        });

        return uniques.sort(function (a, b) {
            return frequency[b] - frequency[a];
        });
    }


    unsafeWindow.gZipImages = gZipImages;
    unsafeWindow.zip = zip;
    unsafeWindow.genZip = genZip;
    unsafeWindow.ImagePanel = ImagePanel;
    unsafeWindow.successfulUrlsSet = ublSitesSet;
    // noinspection JSUnresolvedVariable
    unsafeWindow.ublSitesSet = ublSitesSet;
    unsafeWindow.ublMap = ublMap;

    unsafeWindow.GSaves = GSaves;

    unsafeWindow.getImgMetaById = getImgMetaById;
    // unsafeWindow.getGimgTitle = getGimgTitle;
    unsafeWindow.getGimgDescription = getGimgDescription;

    unsafeWindow.geResultsData = getResultsData;
    unsafeWindow.downloadJSON = downloadJSON;

    unsafeWindow.collectUblSites = collectUblSites;
    unsafeWindow.saveUblSites = saveUblSites;
    unsafeWindow.getMeta = getMeta;

    unsafeWindow.UblMetas = ublMetas;
    unsafeWindow.storeUblMetas = storeUblMetas;
    unsafeWindow.storeUblMap = storeUblMap;
    unsafeWindow.getQualifiedGImgs = getQualifiedGImgs;
    unsafeWindow.extractRarbgTorrentURL = extractRarbgTorrentURL;

    unsafeWindow.getResultsData = getResultsData;
    unsafeWindow.getResultsJSON = getResultsJSON;
    unsafeWindow.getMetaDataSummary = function () {
        const j = getResultsJSON();
        const properties = (function () {
            const ps = new Set();
            for (const o of j.data) {
                ps.addAll(Object.keys(o));
            }
            return ps;
        })();

        const summary = {};
        for (const p of properties) {
            summary[p] = j.data.map(o => o[p]);
        }
        return summary;
    };


    (function createAndAddHighlightCSS() {
            /* Overlay CSS for highlighting selected images */
            // language=CSS
            addCss(`.highlight, .drop-shadow {
                filter: drop-shadow(8px 8px 10px gray) !important;
            }

            .blur.in {
                -webkit-transition: all 0.1s ease-in !important;
                /*-webkit-filter: blur(6px) !important;*/
                transform: scale(0.7) !important;
                opacity: 0.3 !important;
            }

            .blur.out:not(.in) {
                -webkit-filter: blur(0px) !important;
                /*filter: blur(0px) !important;*/
                transform: scale(1) !important;
                opacity: 1 !important;
                -webkit-transition: all 0.25s ease-out !important;
                transition: all 0.25s ease-out !important;
            }

            .transparent {
                opacity: 0.4 !important;
            }

            .sg-too-small {

            }

            .sg-too-small-hide {
                display: none !important;
            }

            .hide-img {
                display: none !important;
            }`, 'filters-style');
            /* "border-bottom: 1px dotted black;" is for if you want dots under the hover-able text */
        }
    )();


    // give a white border so that we'll have them all the same size
    addCss('div.rg_bx { border-radius: 2px;border: 3px #fff solid;}');

    // language=CSS
    addCss(`.hover-click:hover,
.hover-click:focus {
    color: #999;
    text-decoration: none;
    cursor: pointer;
}

/*sg=SuperGoogle, this is padding for the buttons and controls*/
.sg {
    margin: 8px;
}

label[for] {
    padding: 2px;
    border-radius: 4px;
    background: darkgrey;
}

input[type="range"] + label { /*The label elements displaying the slider readings*/
    padding: 6px;
}

a.irc_mutl, a.irc_mi {
    display: contents !important;
}

/*The right upper part of the image panel (containing description and title and stuff)*/
div.irc_hd * {
    margin-right: 3px;
    margin-bottom: 2px;
}

/*keeps the bar at a fixed position when scrolling*/
/*.rshdr, .jsrp{position:fixed; height:100%; width:100%; left:0; top:0; z-index:2;}
#rcnt{position:relative; z-index:1; margin:100% 0 0;}*/
div#extrares {
    display: none !important;
}

/*bigger space between image boxes*/
div.rg_bx {
    margin: 10px;
}

/*fixes the selection area of main image anchors*/
.irc_asc {
    display: inline-block !important;
}

.irc_ris {
    height: fit-content !important;
    width: 80% !important;
}

/**/
div.text-block {
    display: block;
    position: absolute;
    color: white;
    opacity: 0.4;

    padding: 5px;
    margin: 2px;

    min-height: 15px;
    min-width: 15px;
    width: fit-content;
    height: fit-content;
    top: 0;
    left: 0;

    border-radius: 5px;
    font: normal 11px arial, sans-serif;
    white-space: nowrap;
    transition: 0.2s;
}

div.text-block.download-block:hover {
    transform: scale(1.5);
    opacity: 1;
}

div.text-block.ext-gif {
    background-color: magenta;
}

div.text-block.ext:not(.ext-gif) {
    background-color: #00cbff;
}

a.download-related {
    border-radius: 4px;
    border: #454545 2px solid;
    background-color: #454545;

    box-shadow: 
    0 1px 0 rgba(255, 255, 255, .06),
    1px 1px 0 rgba(255, 255, 255, .03),
    -1px -1px 0 rgba(0, 0, 0, .02),
    inset 1px 1px 0 rgba(255, 255, 255, .05);
}

/**/

[type="range"] {
    -webkit-appearance: none;
    /*width: 70%;*/
    height: 15px;
    border-radius: 5px;
    background: #d3d3d3;
    outline: none;
    opacity: 0.7;
    -webkit-transition: .2s;
    transition: opacity .2s;
}

[type="range"]:hover {
    opacity: 1;
}

[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: darkorange;
    cursor: pointer;
}

[type="range"]::-moz-range-thumb {
    width: 25px;
    height: 25px;
    border-radius: 50%;
    background: darkorange;
    cursor: pointer;
}

.fixed-position${Preferences.staticNavbar ? ', #qbc, #rshdr:not(#sfcnt)' : ''} {
    position: fixed;
    top: 0;
    z-index: 1000;
}

.ubl-site {
    color: ${Preferences.successColor} !important;
}

.scroll-nav:hover,
.scroll-nav *:hover:not(.hover-click),
.scroll-nav *:focus:not(.hover-click) {
    cursor: crosshair, auto;
} `, 'superGoogleStyle');


    function setStyleInHTML(el, styleProperty, styleValue) {
        styleProperty = styleProperty.trim().replace(/^.*{|}.*$/g, '');

        const split = styleProperty.split(':');
        if (!styleValue && split.length > 1) {
            styleValue = split.pop();
            styleProperty = split.pop();
        }
        if (el.hasAttribute('style')) {

            const styleText = el.getAttribute('style');
            const styleArgument = `${styleProperty}: ${styleValue};`;

            let newStyle = new RegExp(styleProperty, 'i').test(styleText) ?
                styleText.replace(new RegExp(`${styleProperty}:.+?;`, 'im'), styleArgument) :
                `${styleText} ${styleArgument}`;

            el.setAttribute('style', newStyle);
        }
        return el;
    }

    /**
     * Creates a static navbar at the top of the page.
     * Useful for adding buttons and controls to it
     * @param callback - this callback should be used when instantly adding content to the navbar,
     *  do NOT just take the returned value and start adding elements.
     *  @return {HTMLDivElement|HTMLElement} returns the parent navbar element
     */
    function createAndGetNavbar(callback) {
        // Settings up the navbar
        // language=CSS
        addCss(`div#topnav {
            position: fixed;
            z-index: 1000;
            min-height: 50px;
            top: 0;
            right: 0;
            left: 0;
            background: #525252;
        }

        div#topnav-content {
            margin: 5px;
            padding: 10px;
            font-family: inherit;
            /*font-stretch: extra-condensed;
            font-size: 20px;*/
        }`, 'navbar-css');

        function adjustTopMargin() {
            document.body.style.top = `${q('#topnav').offsetHeight}px`;
        }

        const navbar = document.createElement(`div`);
        navbar.id = 'topnav';
        const navbarContentDiv = document.createElement('div');
        navbarContentDiv.id = 'topnav-content';

        navbar.appendChild(navbarContentDiv);

        document.body.firstElementChild.before(navbar);

        window.addEventListener('resize', adjustTopMargin);

        document.body.style.position = 'relative';

        // keep trying to use the callback, works when the navbarContentDiv is finally added
        var interval = setInterval(function () {
            const topnavContentDiv = q('#topnav-content');
            if (topnavContentDiv) {
                clearInterval(interval);
                if (callback)
                    callback(topnavContentDiv);
                adjustTopMargin();
            }
        }, 100);
        return navbar;
    }

    function removeHash() {
        const withoutHash = location.href.split('#').slice(0, -1).join('#');
        history.pushState(null, document.title, withoutHash);
    }
})();


function addCss(cssStr, id = '') {
    // check if already exists
    const style = document.getElementById(id) || document.createElement('style');

    if (style.styleSheet) {
        style.styleSheet.cssText = cssStr;
    } else {
        style.innerText = cssStr;
    }
    if (!!id) style.id = id;
    style.classList.add('addCss');
    return document.getElementsByTagName('head')[0].appendChild(style);
}

function isBase64ImageData(str) {
    return /^data:image\/.{1,5};base64/.test(str);
}
function urlToAnchor(href) {
    var a = document.createElement('a');
    a.setAttribute('href', href);
    a.target = target;
    document.body.appendChild(a);
    return a;
}
function anchorClick(href, downloadValue, target) {
    var a = document.createElement('a');
    a.setAttribute('href', href);
    a.setAttribute('download', downloadValue);
    a.target = target;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function removeDoubleSpaces(str) {
    return !!str ? str.replace(/(\s{2,})/g, ' ') : str;
}

function getHostname(href) {
    const a = document.createElement('a');
    a.href = href;
    return a.hostname;
}

function elementUnderMouse(wheelEvent) {
    return document.elementFromPoint(wheelEvent.clientX, wheelEvent.clientY);
}

function makeTextFile(text) {
    var data = new Blob([text], {type: 'text/plain'});
    var textFile = null;
    // If we are replacing a previously generated file we need to manually revoke the object URL to avoid memory leaks.
    if (textFile !== null) window.URL.revokeObjectURL(textFile);
    textFile = window.URL.createObjectURL(data);
    return textFile;
}

function cleanGibberish(str, minWgr, debug = false) {
    if (str) {
        const gibberishRegex = /(\W{2,})|(\d{3,})|(\d+\w{1,5}\d+){2,}/g;
        let noGibberish = removeDoubleSpaces(str.replace(gibberishRegex, ' '));
        /**
         * The minimum word2gibberish ratio to exit the loop
         * @type {number|*}
         */
        minWgr = minWgr || 0.4;
        if (noGibberish.length < 3) return str;
        /**
         * WGR: Word to Gibberish Ratio (between 0 and 1)
         * 0:   No gibberish    (Good)
         * 1:   100% Gibberish  (Bad)
         * @type {number}
         */
        let wgr = (str.length - noGibberish.length) / str.length;
        if (debug) console.debug(
            'cleanGibberish(' + str + ')' +
            '\nOriginal:', str,
            '\nNoGibberish:', noGibberish,
            '\nRatio:', wgr
        );

        return wgr > minWgr ?
            cleanGibberish(noGibberish, minWgr) :
            (str.length > 3 ? str : '');
    }
    return '';
}


/**
 * @param {function} callback -
 * @param {Object=} options
 * @param {boolean} [options.singleCallbackPerMutation=false]
 *
 * @param {string[]} [options.attributeFilter=[]] Optional - An array of specific attribute names to be monitored. If this property isn't included, changes to all attributes cause mutation notifications. No default value.
 * @param {boolean} [options.attributeOldValue=false] Optional - Set to true to record the previous value of any attribute that changes when monitoring the node or nodes for attribute changes; see Monitoring attribute values in MutationObserver for details on watching for attribute changes and value recording. No default value.
 * @param {boolean} [options.attributes=false] Optional - Set to true to watch for changes to the value of attributes on the node or nodes being monitored. The default value is false.
 * @param {boolean} [options.characterData=false] Optional - Set to true to monitor the specified target node or subtree for changes to the character data contained within the node or nodes. No default value.
 * @param {boolean} [options.characterDataOldValue=false] Optional - Set to true to record the previous value of a node's text whenever the text changes on nodes being monitored. For details and an example, see Monitoring text content changes in MutationObserver. No default value.
 * @param {boolean} [options.childList=false] Optional - Set to true to monitor the target node (and, if subtree is true, its descendants) for the addition or removal of new child nodes. The default is false.
 * @param {boolean} [options.subtree=false] Optional -
 */
function observeDocument(callback, options = {}) {
    if ($ && typeof ($.extend) === 'function') {
        options = $.extend({
            singleCallbackPerMutation: false,

            attributeFilter: [],
            attributeOldValue: true,
            attributes: true,
            characterData: false,
            characterDataOldValue: false,
            childList: true,
            subtree: true,
        }, options);
    }

    elementReady('body').then((body) => {
        callback(document.documentElement);

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
        if (MutationObserver) {
            var observer = new MutationObserver(
                function mutationCallback(mutations) {
                    for (const mutation of mutations) {
                        if (!mutation.addedNodes.length)
                            continue;
                        callback(mutation.target);
                        if (options.singleCallbackPerMutation === true) {
                            break;
                        }
                    }
                }
            );
            return observer.observe(document.documentElement, options);
        } else {
            document.addEventListener('DOMAttrModified', callback, false);
            document.addEventListener('DOMNodeInserted', callback, false);
        }
    });
}

function elementReady(selector, timeoutInMs = -1) {
    return new Promise((resolve, reject) => {
        var getter = typeof selector === 'function' ?
            () => selector() :
            () => document.querySelectorAll(selector)
        ;
        var els = getter();
        if (els && els.length) {
            resolve(els[0]);
        }
        if (timeoutInMs > 0)
            var timeout = setTimeout(() => {
                reject(`elementReady(${selector}) timed out at ${timeoutInMs}ms`);
                console.warn(`elementReady(${selector}) timed out at ${timeoutInMs}ms`);
            }, timeoutInMs);


        new MutationObserver((mutationRecords, observer) => {
            const elements = getter() || [];
            Array.from(elements).forEach((element) => {
                clearTimeout(timeout);
                resolve(elements);
                resolve(element); // this doesn't even do anything, there will be only a single call to resolve()
                console.debug('resolve(element):', element);
                observer.disconnect();
            });

        }).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    });
}
function getElementsByXPath(xpath, parent) {
    let results = [];
    let query = document.evaluate(xpath,
        parent || document,
        null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0, length = query.snapshotLength; i < length; ++i) {
        results.push(query.snapshotItem(i));
    }
    return results;
}

/** Create an element by typing it's inner HTML.
 For example:   var myAnchor = createElement('<a href="https://example.com">Go to example.com</a>');
 * @param html
 * @param callback optional callback, invoked once the element is created, the element is passed.
 * @return {Element}
 */
function createElement(html, callback) {
    const div = document.createElement('div');
    div.innerHTML = (html).trim();
    const element = div.firstElementChild;
    if (!!callback && callback.call)
        callback.call(null, element);

    return element;
}

function unsafeEval(func, opt) {
    let body = 'return (' + func + ').apply(this, arguments)';
    unsafeWindow.Function(body).call(unsafeWindow, opt);
}

/**
 * @author: https://greasyfork.org/en/scripts/19210-google-direct-links-for-pages-and-images/code
 * Google: Direct Links for Pages and Images
 */
function googleDirectLinks() {
    unsafeEval(function (opt_noopen) {

        var debug = false;
        var count = 0;

        var options = {noopen: opt_noopen};
        debug && console.log('Options:', options);

        // web pages: url?url=
        // images: imgres?imgurl=
        // custom search engine: url?q=
        // malware: interstitial?url=
        var re = /\b(url|imgres)\?.*?\b(?:url|imgurl|q)=(https?\b[^&#]+)/i;
        /** replace redirect, also replace dataUris */
        var restore = function (link, url) {
            var oldUrl = link.getAttribute('href') || '';
            var newUrl = url || oldUrl;
            var matches = newUrl.match(re);
            if (matches) {
                debug && console.log('restoring', link._x_id, newUrl);

                link.setAttribute('href', decodeURIComponent(matches[2]));
                enhanceLink(link);
                if (matches[1] === 'imgres') {
                    if (link.querySelector('img[src^="data:"]')) {
                        link._x_href = newUrl;
                    }
                    enhanceThumbnail(link, newUrl);
                }
            } else if (url != null) {
                link.setAttribute('href', newUrl);
            }
        };

        /** stop propagation onclick */
        var purifyLink = function (a) {
            if (/\brwt\(/.test(a.getAttribute('onmousedown'))) {
                a.removeAttribute('onmousedown');
            }
            if (a.parentElement &&
                /\bclick\b/.test(a.parentElement.getAttribute('jsaction') || '')) {
                a.addEventListener('click', function (e) {
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                }, true);
            }
        };

        /**
         * - purifyLink
         * - set rel="noreferrer", referrerpolicy="no-referrer"
         * - stopImmediatePropagation onclick */
        var enhanceLink = function (a) {
            purifyLink(a);
            a.setAttribute('rel', 'noreferrer');
            a.setAttribute('referrerpolicy', 'no-referrer');
        };

        /** make thumbnail info-bar clickable
         *  @faris: storing "fullres-src" attribute to images
         */
        var enhanceThumbnail = function (link, url) {
            // @faris, storing fullres-src attribute to images
            var imgs = [].slice.call(link.querySelectorAll('div~img'));
            imgs.length && imgs.forEach(function (img) {
                console.log('img fullres-src="' + link.href + '"');
                img.setAttribute('fullres-src', link.href);
            });

            var infos = [].slice.call(link.querySelectorAll('img~div'));
            if (infos.length > 0) {
                var pageUrl = decodeURIComponent(url.match(/[?&]imgrefurl=([^&#]+)/)[1]);
                infos.forEach(function (info) {
                    var pagelink = document.createElement('a');
                    enhanceLink(pagelink);
                    pagelink.href = pageUrl;
                    pagelink.className = 'x_source_link';
                    pagelink.textContent = info.textContent;
                    info.textContent = '';
                    info.appendChild(pagelink);
                });
            }
        };

        /** returns full path, not just partial path */
        var normalizeUrl = (function () {
            var fakeLink = document.createElement('a');

            return function (url) {
                fakeLink.href = url;
                return fakeLink.href;
            }
        })();

        var handler = function (a) {
            if (a._x_id) {
                restore(a);
                return;
            }

            a._x_id = ++count;
            debug && a.setAttribute('x-id', a._x_id);

            a.__defineSetter__('href', function setter(v) {
                // in case an object is passed by clever Google
                restore(this, String(v));
            });
            a.__defineGetter__('href', function getter() {
                debug && console.log('get', this._x_id, this.getAttribute('href'), this);
                return normalizeUrl(this.getAttribute('href'));
            });

            if (/^_(?:blank|self)$/.test(a.getAttribute('target')) ||
                /\brwt\(/.test(a.getAttribute('onmousedown')) ||
                /\bmouse/.test(a.getAttribute('jsaction')) ||
                /\bclick\b/.test(a.parentElement.getAttribute('jsaction'))) {
                enhanceLink(a);
            }
            restore(a);
        };


        // observe


        var checkNewNodes = function (mutations) {
            debug && console.log('State:', document.readyState);
            if (mutations.target) {
                checkAttribute(mutations);
            } else {
                mutations.forEach && mutations.forEach(checkAttribute);
            }
        };
        var checkAttribute = function (mutation) {
            var target = mutation.target;
            if (target.parentElement && target.parentElement.classList.contains('text-block')) // faris special blacklist
                return;

            if (target && target.nodeName.toUpperCase() === 'A') {
                if ((mutation.attributeName || mutation.attrName) === 'href') {
                    debug && console.log('restore attribute', target._x_id, target.getAttribute('href'));
                }
                handler(target);
            } else if (target instanceof Element) {
                [].slice.call(target.querySelectorAll('a')).forEach(handler);
            }
        };

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

        if (MutationObserver) {
            debug && console.log('MutationObserver: true');
            new MutationObserver(checkNewNodes).observe(document.documentElement, {
                childList: true,
                attributes: true,
                attributeFilter: ['href'],
                subtree: true
            });
        } else {
            debug && console.log('MutationEvent: true');
            document.addEventListener('DOMAttrModified', checkAttribute, false);
            document.addEventListener('DOMNodeInserted', checkNewNodes, false);
        }

    });
}
