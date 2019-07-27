// ==UserScript==
// @name         Super Google Images
// @namespace    https://github.com/FarisHijazi
// @author       Faris Hijazi
// @version      0.8
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
// @grant        window.close
// @require      https://code.jquery.com/jquery-3.4.0.min.js
// @require      https://raw.githubusercontent.com/kimmobrunfeldt/progressbar.js/master/dist/progressbar.min.js
// @require      https://raw.githubusercontent.com/Stuk/jszip/master/dist/jszip.min.js
// @require      https://github.com/ccampbell/mousetrap/raw/master/mousetrap.min.js
// @require      https://github.com/FarisHijazi/GM_downloader/raw/master/GM_Downloader.user.js
// @require      https://github.com/FarisHijazi/ShowImages.js/raw/master/ShowImages.js
// @updateUrl    https://raw.githubusercontent.com/FarisHijazi/SuperGoogle/master/SuperGoogle.user.js
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
 *                   key | description      | example values
 * @property {string} id:  Id               - "ZR4fY_inahuKM:",
 * @property {string} isu: Hostpage URL     - "gifs.cc",
 * @property {number} itg: Image Tag        - 0,
 * @property {string} ity: Image Type       - "gif",
 *
 * @property {number} oh:  Original Height  - 322,
 * @property {string} ou:  Original URL     - "http://78.media.tumblr.com/....500.gif",
 * @property {number} ow:  Original Width   - 492,
 *
 * @property {string} rh:  Referrer Host    - "",
 * @property {string} rid: Referrer id      - "nyyV1PqBnBltYM",
 * @property {number} rmt: Referrer ? ?     - 0,
 * @property {number} rt:  Referrer ? ?     - 0,
 * @property {string} ru:  Referrer URL     - "",
 *
 * @property {string} pt:  Primary Title    - "",
 * @property {string} s:   Description      - "Photo",
 * @property {string} st:  Secondary Title  - "",
 * @property {number} th:  Thumbnail Height - 182,
 * @property {string} tu:  Thumbnail URL    - "https://encrypted-tbn0.gstatic.com/images?q",
 * @property {number} tw:  Thumbnail Width  - 278
 *
 * my added properties:
 * @property {string} src:  src of the IMG element
 * @property {number[]} dim:  dimensions [width, height]
 */


/** returns full path, not just partial path */
var normalizeUrl = (function () {
    const fakeLink = document.createElement('a');
    return function (url) {
        fakeLink.href = url;
        return fakeLink.href;
    };
})();

const PProxy = (function () {
    class ProxyInterface {
        constructor() {
            throw Error('Static class cannot be instantiated');
        }
        static get color() {
            return '#00000';
        }
        // only to be used by children
        static get name() {
            return constructor.name;
        }

        static test(url) {
        }
        static proxy(url) {
        }
        static reverse(proxyUrl) {
        }
    }

    /**Returns a DuckDuckGo proxy url (attempts to unblock the url)*/
    class DDG extends ProxyInterface {
        static get color() {
            return '#FFA500';
        }
        static test(url) {
            return /^https:\/\/proxy\.duckduckgo\.com/.test(url);
        }
        static proxy(url) {
            return DDG.test(url) || /^(javascript)/i.test(url) ? url : (`https://proxy.duckduckgo.com/iu/?u=${encodeURIComponent(url)}&f=1`);
        }
        /** @deprecated */
        static isDdgUrl() {
            new Error('This function "isDdgUrl()" is deprecated, use "PProxy.DDG.test()" instead');
        }
        static reverse(url) {
            // if (isZscalarUrl(url)) s = getOGZscalarUrl(url); // extra functionality:
            if (!DDG.test(url)) {
                return url;
            }
            return new URL(location.href).searchParams.get('u');
        }
    }

    /**Returns a Pocket proxy url*/
    class Pocket extends ProxyInterface {
        //             static BASE_URL = 'https://d3du9nefdtilsa.cloudfront.net/unsafe/fit-in/x/smart/filters%3Ano_upscale()/';
        static get color() {
            return '#e082df';
        }
        static test(url) {
            return /(^https:\/\/pocket-image-cache\.com\/direct\?url=)|(cloudfront\.net\/unsafe\/fit-in\/x\/smart\/filters%3Ano_upscale\(\)\/)/.test(url);
        }
        static proxy(url) {
            return Pocket.test(url) || /^(javascript)/i.test(url) ? url : 'https://pocket-image-cache.com/direct?url=' + url;
        }
        static reverse(url) {
            if (!Pocket.test(url)) {
                return url;
            }

            if (url.indexOf(Pocket.BASE_URL) === 0) {
                return url.substring(Pocket.BASE_URL.length, -1);
            }
            if (url.indexOf('https://pocket-image-cache.com/direct') === 0) {
                return new URL(url).searchParams.get('url');
            }
            return url;
        }
    }

    class FileStack extends ProxyInterface {
        static get color() {
            return '#acb300';
        }
        static test(url) {
            return /https:\/\/process\.filestackapi\.com\/.+\//.test(url);
        }
        static proxy(url) {
            return 'https://process.filestackapi.com/AhTgLagciQByzXpFGRI0Az/' + encodeURIComponent(url.trim());
        }
        static reverse(url) {
        }
    }

    class SteemitImages extends ProxyInterface {
        static get color() {
            return '#0074B3';
        }
        static test(url) {
            return /https:\/\/steemitimages\.com\/(p|0x0)\//.test(url);
        }
        static proxy(url) {
            return /\.(jpg|jpeg|tiff|png|gif)($|[?&])/i.test(url) ? ('https://steemitimages.com/0x0/' + url.trim()) : url;
        }
        static reverse(url) {
            if (!SteemitImages.test(url)) {
                return url;
            }
            console.warn('SteemitImages.reverse() is not fully supported, it\'ll only work sometimes');
            return url.replace('https://steemitimages.com/0x0/', '');
        }
    }

    //

    var PProxy = {};
    PProxy.proxies = [
        FileStack,
        SteemitImages,
        DDG,
        Pocket,
    ];
    PProxy.__defineGetter__('names', () => PProxy.proxies.map(p => p.name));
    /**
         * get a proxified url from each proxy
         * @param url
         * @returns {*}
         */
    PProxy.proxyList = function (url) {
        if (url) return PProxy.proxies.map(proxy => proxy.proxy(url));
    };
    PProxy.proxyAll = function (url) {
        var o = {};
        if (url) o.proxies.forEach(proxy => o[proxy.name] = proxy.proxy(url));
        return o;
    };

    for (const p of PProxy.proxies) {
        PProxy[p.name] = p;
    }

    return PProxy;
})();


// main
(function () {
    'use strict';

    // todo: replace this with importing GM_dummy_functions, and importing a polyfill
    if (typeof unsafeWindow === 'undefined') unsafeWindow = window;
    unsafeWindow.unsafeWindow = unsafeWindow;

    // prevents duplicate instances
    if (typeof unsafeWindow.superGoogle !== 'undefined')
        return;

    unsafeWindow.superGoogle = this;


    // REFACTOR: TODO: group this into an import-able that will do this simply by importing
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
        return new Set(Array.from(this).filter(x => !other.has(x)));
    };


    // === end of basic checks and imports ===


    var debug = true;
    var showImages = new ShowImages({
        loadMode: 'serial',
        imagesFilter: (img, anchor) => {
            var conditions = [
                // !img.classList.contains(showImages.ClassNames.DISPLAY_ORIGINAL),
                // !img.closest('.' + this.ClassNames.DISPLAY_ORIGINAL),
                // /\.(jpg|jpeg|tiff|png|gif)($|[?&])/i.test(anchor.href),
                !img.classList.contains('irc_mut'),
                !img.closest('div.irc_rismo'),
                !/^data:/.test(anchor.href || img.src),
            ];
            return conditions.reduce((a, b) => a && b);
        },
    });
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

    const Components = {
        minImgSizeSlider: {},

    };


    // OPTIONS:

    // TODO: add a little dropdown where it'll show you the current options and you can
    //      modify them and reload the page with your changes
    const Preferences = (function () {
        const DEFAULTS = {
            // everything that has to do with the search page and url
            location: {
                customUrlArgs: {
                    // "tbs=isz": "lt",//
                    // islt: "2mp",    // isLargerThan
                    // tbs: "isz:l",   // l=large, m=medium...
                    // "hl": "en",
                },
                /**
                 * @type {string|null}
                 * if this field is falsy, then there will be no changes to the url.
                 * disable by prepending with '!'
                 */
                forcedHostname: 'ipv4.google.com',
            },
            // these should be under "page"
            page: {
                defaultAnchorTarget: '_blank',
                staticNavbar: false,
                autoLoadMoreImages: true,
                showImgHoverPeriod: 350,
                disableDragging: true, //disable dragging images to reverse image search
            },
            shortcuts: {
                hotkey: 'ctrlKey', // 'altKey', 'shiftKey'
            },
            loading: {
                successColor: 'rgb(167, 99, 255)',
                hideFailedImagesOnLoad: false,
                useDdgProxy: true,
            },
            ubl: {
                periodicUblSaving: false, // periodically save the unblocked sites list
            },
            panels: {
                autoShowFullresRelatedImages: true,
                loopbackWhenCyclingRelatedImages: false,
                favoriteOnDownloads: true, // favorite any image that you download
                invertWheelRelativeImageNavigation: false,
            },
        };

        var o = $.extend(DEFAULTS, GM_getValue('Preferences'));

        o.store = () => GM_setValue('Preferences', o);
        o.get = () => GM_getValue('Preferences');


        // write back to storage (in case the storage was empty)
        o.store();

        return o;
    })();


    const GoogleUtils = (function () {
        var isOnGoogle = () => GoogleUtils.elements.selectedSearchMode && GoogleUtils.elements.selectedSearchMode.innerHTML === 'Images';

        /**
         * @type {{
         *      isOnEncryptedGoogle: boolean,
         *     googleBaseURL: String,
         *     gImgSearchURL: String,
         *     reverseImageSearchUrl: String,
         *     getGImgReverseSearchURL: Function,
         *     siteSearchUrl: Function,
         * }}
         */
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
        o.__defineGetter__('isOnGoogleImagesPanel', () => {
            const url1 = new URL(location.href);
            return url1.searchParams.has('imgrefurl') && url1.pathname.split('/').pop() === 'imgres';
        }
        );

        return o;
    })();
    unsafeWindow.GoogleUtils = GoogleUtils;

    // GM_setValue(Constants.GMValues.UBL_SITES, "");
    // GM_setValue(Constants.GMValues.UBL_URLS, "");
    // GM_setValue(Constants.GMValues.UBL_SITES_MAP, "");

    const ublSitesSet = new Set();
    const ublMetas = new Set();

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


    /**
     * the zip file
     * @type {JSZip}
     */
    var zip = new JSZip();
    zip.name = (document.title).replace(/site:|( - Google Search)/gi, '');

    var shouldShowOriginals = false;
    var currentDownloadCount = 0;
    var isTryingToClickLastRelImg = false;

    var directLinkReplacer = googleDirectLinksInit();
    unsafeWindow.directLinkReplacer = directLinkReplacer;

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
            return document.querySelectorAll('div.str-clip-card-space:not(.modified)');
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
            if (document.querySelector('#add-direct-urls-button')) return;
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
            if (document.querySelector('#download-json-button')) // button already exists
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


    /*
     * change mouse cursor when hovering over elements for scroll navigation
     * cursor found here:   https://www.flaticon.com/free-icon/arrows_95103#
     */


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
    }


    /**
     * ImagePanel class
     * @static thePanels - static
     * @property el
     * @property
     * Provides functions for a partner element (one of the 3 panels)
     * ## Injecting:
     *  Injecting elements to the panels works with 2 steps:
     *      1- An inject function: this will create the element and put it in the right place (also checks if it already exists or not)
     *      2- An update function: this will be called every time the panels are changed
     * Abbreviations:
     *  ris: related image search
     *  fc:  focused
     *  sbi: search by image
     */
    class ImagePanel {  // ImagePanel class
        // TODO: instead of using an object and creating thousands of those guys, just extend the panel element objects
        //      give them more functions and use THEM instead of using the wrapper class
        constructor(element) {
            if (typeof (ImagePanel.thePanels) === 'undefined') {
                ImagePanel.thePanels = new Set();
            }

            if (ImagePanel.thePanels.has(element.panel)) {
                return element.panel;
            }
            if (ImagePanel.thePanels.size >= 3) {
                console.warn('You\'ve already created 3 panels:', ImagePanel.thePanels, 'trying to create:', element);
            }
            if (typeof element !== 'undefined') {
                this.el = element;
                element.__defineGetter__('panel', () => this);

                // TODO: try extending using the ImagePanel.prototype
                // extend the element
                for (var key of Object.keys(this)) {
                    console.debug('extending panel, adding:', key, element);
                    element[key] = this[key];
                }

                ImagePanel.thePanels.add(element.panel);
            }

            this.__modifyPanelEl();
        }
        /** The big panel that holds all 3 child panels
         * @return {HTMLDivElement|Node} */
        static get mainPanelEl() {
            return document.querySelector('div#irc_cc');
        }
        /** @return {ImagePanel} returns the panel that is currently in focus (there are 3 panels) */
        static get focP() {
            return this.mainPanelEl.querySelector('div.irc_c[style*="translate3d(0px, 0px, 0px)"]').panel;
            // or you could use     document.querySelectorAll('div#irc_cc > div.irc_c[style*="translate3d(0px, 0px, 0px)"]');
        }
        static get noPanelWasOpened() {
            return document.querySelector('#irc_cb').getAttribute('data-ved') == null;
        }
        static get panelCurrentlyOpen() {
            return document.querySelector('#irc_bg').style.display !== 'none';
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
        get panel() {
            return this;
        }
        /** @return {HTMLDivElement} div.irc_it */
        get titleAndDescriptionDiv() {
            if (!this.el) {
                return;
            }
            const titleAndDescrDiv = this.q('div.irc_b.irc_mmc div.irc_it');
            if (!titleAndDescrDiv) {
                console.warn('TitleAndDescription div not found!');
            }
            return titleAndDescrDiv;
        }
        /** @return {HTMLSpanElement} */
        get descriptionEl() {
            const titleDescrDiv = this.titleAndDescriptionDiv;
            if (titleDescrDiv) {
                return titleDescrDiv.querySelector('div.irc_asc span.irc_su');
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
            return [];
        }
        /** @return {HTMLDivElement} returns related image container (div.irc-deck)*/
        get ris_Container() {
            return Array.from(this.qa('div.irc_ris > div > div.irc_rit.irc-deck.irc_rit')).pop();
        }
        /**
         * @type {NodeListOf<HTMLAnchorElement>}
         * @returns {Object} buttons
         * @property {HTMLAnchorElement} buttons.Visit:       a.i3599.irc_vpl.irc_lth,
         * @property {HTMLAnchorElement} buttons.Save:        a.i15087, (not saved: i15087 saved: i35661)
         * @property {HTMLAnchorElement} buttons.View saved:  a.i18192.r-iXoO2jjyyEGY,
         * @property {HTMLAnchorElement} buttons.Share:       a.i17628
         * @property {HTMLAnchorElement} buttons.notsaved:    a.i15087
         * @property {HTMLAnchorElement} buttons.saved:       a.i35661
         *
         * @property {Function} buttons.save
         * @property {Function} buttons.unsave
         */
        get buttons() {
            const buttonsContainer = this.q('.irc_but_r > tbody > tr');
            const buttons = this.qa('.irc_but_r > tbody > tr a:first-child');

            buttons.Visit = buttonsContainer.querySelector('a.i3599.irc_vpl.irc_lth');
            buttons.Save = buttonsContainer.querySelector('a.i15087');
            buttons.ViewSaved = buttonsContainer.querySelector('a.i18192.r-iXoO2jjyyEGY');
            buttons.Share = buttonsContainer.querySelector('a.i17628');

            buttons.notsaved = buttonsContainer.querySelector('a.i15087'); // the button that appears without a star (not saved)
            buttons.saved = buttonsContainer.querySelector('a.i35661'); // has a star (means it's saved)

            buttons.save = function () {
                // if not saved, save
                if (buttons.saved && buttons.saved.style.display === 'none') {
                    buttons.saved.click();
                }
            };
            buttons.unsave = function () {
                // if saved, unsave
                if (buttons.notsaved && buttons.notsaved.style.display === 'none') {
                    buttons.notsaved.click();
                }
            };

            return buttons;
        }
        /** @return {HTMLImageElement }
         * img.irc_mi is the actual main image, , img.irc_mut is the loader image (the thumbnail when it didn't load yet)*/
        get mainImage() {
            if (this.el) {
                return this.q('a.irc_mil > img.irc_mi');
            }
        }
        get loaderImage() {
            if (this.el) {
                return this.q('a.irc_mutl  > img.irc_mut');
            }
        }

        //get imageUrl() {return this.mainImage.src;}
        get bestNameFromTitle() {
            const sTitle = this.sTitle_Text;
            const pTitle = this.pTitle_Text;
            const description = this.descriptionText;
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
         * Search-By-Image URL
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
        /**
         * waits for the first panel to be in focus, then binds mutation observers to panels firing "panelMutation" events
         * Also applies modifications to panels (by calling modifyP)
         */
        static init() {
            // wait for panel to appear then start modding
            elementReady('div#irc_cc > div.irc_c[style*="translate3d(0px, 0px, 0px)"]').then(function () {

                // bind clicking the image panel 'X' button remove the hash from the address bar
                // there exists only a single X button common for all 3 image panels
                $('a#irc_cb').click(removeHash);

                // instantiate the panels and (which call modPanel() and updatePanel(), which do the modifying)
                $('#irc_cc > div').toArray()
                    .map(panelEl => new ImagePanel(panelEl))
                    .forEach(panel => {// observe each panel
                        /* @info
                         * in the website, every change that happens causes 2 data-dev mutations
                         * - first one with oldValue = <stuff saldkfjasldfkj>
                         * - second has oldValue = null
                         * only a single callback is needed for each change, so I'll call it on the second mutation when (oldValue=null)
                         */

                        // bind mutation observer, observes every change happening to the panels (any one of them)
                        const mutationObserver = new MutationObserver((mutations, observer) => {
                            if (mutations[0].oldValue === null) { // if this is the second mutation
                                observer.disconnect(); // stop watching until changes are done

                                const event = new Event('panelMutation');
                                event.mutations = mutations;
                                panel.el.dispatchEvent(event);

                                observePanel(); // continue observing
                            }
                        });

                        // creating a function (template for observing)
                        const observePanel = () =>
                            mutationObserver.observe(panel.el, {
                                childList: false,
                                subtree: false,
                                attributes: true,
                                attributeOldValue: true,
                                attributeFilter: ['data-ved']
                            });

                        //start observing
                        observePanel();
                    });
            });
        }
        /**Goes to the previous (Left) main mainImage*/
        static previousImage() {
            const previousImageArrow = document.querySelector('div#irc-lac > a');  // id that starts with "irc-la"
            var x = previousImageArrow && previousImageArrow.style.display !== 'none' ? // is it there?
                !previousImageArrow.click() : // returns true
                false;
            if (!x) console.log('prev arrow doesn\'t exist');
            return previousImageArrow;
        }
        /**Goes to the next (Right) main mainImage*/
        static nextImage() {
            const nextImageArrow = document.querySelector('div#irc-rac > a');  // id that starts with "irc-ra"
            var x = nextImageArrow && nextImageArrow.style.display !== 'none' ? // is it there?
                !nextImageArrow.click() : // returns true
                false;
            if (!x) debug && console.log('next arrow doesn\'t exist');
            return nextImageArrow;
        }
        /**
         * FIXME: doesn't really work
         * fetches and goes to the page for the current image (similar to image search but just 'more sizes of the same image')
         */
        static moreSizes() {
            const panel = this;
            const reverseImgSearchUrl = GoogleUtils.url.getGImgReverseSearchURL(panel.ris_fc_Div.querySelector('img').src);

            const fetchUsingProxy = (url, callback) => {
                const proxyurl = 'https://cors-anywhere.herokuapp.com/';
                callback = callback || (contents => console.log(contents));
                return fetch(proxyurl + url) // https://cors-anywhere.herokuapp.com/https://example.com
                    .then(response => response.text())
                    .then(callback)
                    .catch(() => console.error(`Can’t access ${url} response. Blocked by browser?`))
            };
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

            var relatedImageDownloads = Array.from(relatedImageDivs).map(imgDiv => {
                var img = imgDiv.querySelector('img');
                var meta = getMeta(img);
                var imgTitle = '';

                if (Object.keys(meta).length <= 2) {
                    console.debug(
                        'Found a metaObject that is too small:', meta,
                        '\nReplacing with:', meta = getImgMetaById(meta.id)
                    );
                }

                imgTitle = meta.pt;
                const href = imgDiv.querySelector('a[href]').href;

                return {
                    url: href,
                    name: imgTitle,
                    directory: 'Google related images',
                    element: img
                };
            });
            console.log('related image downloads:', relatedImageDownloads);

            relatedImageDownloads.forEach(opts => download(opts));
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
                download(currentImageURL, name, focused_risDiv);
                panel.q('.torrent-link').click();

                if (Preferences.panels.favoriteOnDownloads) {
                    panel.buttons.save();
                }
            } catch (e) {
                console.warn(e);
            }
        }
        static showRis() {
            ImagePanel.thePanels.forEach(p => p.showRis());
        }
        static prevRelImg() {
            ImagePanel.focP.prevRelImg();
        }
        static nextRelImg() {
            ImagePanel.focP.nextRelImg();
        }
        //todo: rather than clicking the image when it loads, just set the className to make it selected: ".irc_rist"
        /**
         * keeps on trying to press the bottom related image (the last one to the bottom right) until it does.
         * @param interval  the interval between clicks
         */
        static __tryToClickBottom_ris_image(interval = 30) {
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

        /** Should be called only once for each panel */
        __modifyPanelEl() {
            const panel = this;
            if (panel.el.classList.contains('modified-panel')) {
                console.warn('panel already modified, do not try to modify it again');
                return panel;
            }

            debug && console.debug('Modifying panelEl:', panel.el);

            panel.el.addEventListener('panelMutation', () => panel.onPanelMutation());
            panel.el.classList.add('modified-panel');

            panel.rightPart.classList.add('scroll-nav');

            // add onerror listener to the mainimage
            // this.mainImage.addEventListener('error', function(e) { console.log('OOPSIE WOOPSIE!! Uwu We made a fucky wucky!! A wittle fucko boingo! The code monkeys at our headquarters are working VEWY HAWD to fix this!', e); });


            // adding text-decoration to secondary title
            $(panel.sTitle_Anchor).parent()
                .after('<div class="' + Consts.ClassNames.belowDiv + ' _r3" style="padding-right: 5px; text-decoration:none;"/>');


            panel.inject_SiteSearch();

            panel.inject_ViewImage();
            panel.inject_DownloadImage();

            panel.inject_sbi();

            panel.inject_Download_ris();
            panel.inject_ImageHost();

            /* @deprecated: the imgDimensions element was removed from the webpage*/
            const dimensionsEl = panel.q('.irc_idim');
            if (dimensionsEl) {
                dimensionsEl.addEventListener('click', ImagePanel.moreSizes);
                dimensionsEl.classList.add('hover-click');
            }

            // remove "Images may be subject to copyright" text
            (function removeCopyrightElement() {
                panel.sTitle_Anchor.style = 'padding-right: 5px; text-decoration:none;';
                for (const copyrightEl of getElementsByXPath('//span[contains(text(),\'Images may be subject to copyright\')]', panel.el))
                    copyrightEl.remove();
            })();

            // injecting rarbg torrent link button
            (function injectRarbgButton() {
                const rarbg_tl = createElement(`<a class="_r3 hover-click o5rIVb torrent-link"
   style=" float: left; padding: 4px; display: inline-block; font-size: 10px; color: white;">
    <img src="https://dyncdn.me/static/20/img/16x16/download.png" alt="Rarbg torrent link" border="0" style=" width: 25px; height: 25px; display: none;">
    <label style=" display: list-item; ">Torrent link</label></a>`);
                rarbg_tl.onclick = () => {
                    if (/\/torrent\/|rarbg/i.test(panel.pTitle_Anchor.href)) {
                        panel.pTitle_Anchor.hostname = 'www.rarbgaccess.org'; // choosing a specific mirror
                        anchorClick(extractRarbgTorrentURL(panel.pTitle_Anchor.innerText, panel.pTitle_Anchor.href), '_blank');
                    }
                };
                panel.pTitle_Anchor.before(rarbg_tl);
            })();

            //@info .irc_ris    class of the relatedImgsDivContainer
            //@info div#isr_mc  the main container containing all the image boxes, and the panels (only 2 children)
            panel.el.addEventListener(
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
                                    delta = Math.max(-1, Math.min(1, (wheelEvent.wheelDelta || -wheelEvent.detail))); // getting wheel delta

                                if (Math.abs(delta) < 0.1) { // Do nothing if didn't scroll
                                    console.debug('Mousewheel didn\'t move');
                                    return false;
                                }
                                // Wheel definetely moved at this point
                                let wheelUp = Preferences.panels.invertWheelRelativeImageNavigation ? (delta > 0.1) : (delta < 0.1);
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
                                            ImagePanel.nextRelImg();
                                        } else {
                                            ImagePanel.prevRelImg();
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
                    var bindEl = document.querySelector(selector);
                    if (bindEl) {
                        bindEl.outerHTML = bindEl.outerHTML.replace(new RegExp(char, 'i'), `<u>${char}</u>`);
                    }
                }
            }

            (function moveImgDimensionEl() {
                const imgDimEl = panel.q('.rn92ee.irc_msc');
                if (imgDimEl) {
                    panel.sTitle_Anchor.after(imgDimEl);
                }
            })();

            // ImagePanel.updateP(panel);
            return panel;
        }
        /**
         * Called once every time the panel is changed
         * @return {boolean}
         */
        __update() {
            let panel = this;
            // panel.removeLink();
            // panel.injectSearchByImage();
            // panel.addDownloadRelatedImages();

            //TODO: maybe this is what's preventing the main image from changing even when the ris loads

            // make sure that main image link points to the main image (and not to the website)
            var imgAnchor = panel.q('a.irc_mutl');
            try {
                imgAnchor.__defineSetter__('href', function (value) {
                    this.setAttribute('href', value);
                });
                imgAnchor.__defineGetter__('href', function () {
                    imgAnchor.href = imgAnchor.querySelector('img').src || '#';
                    return this.getAttribute('href');
                });
            } catch (e) {
                console.warn(e);
            }
            imgAnchor.href = imgAnchor.querySelector('img').src || '#';
            imgAnchor.addEventListener('click', function (e) {
                window.open(this.querySelector('img').src, '_blank');
                e.preventDefault();
                e.stopImmediatePropagation();
            });


            panel.linkifyDescription();
            panel.addImageAttributes();
            panel.update_SiteSearch();
            panel.update_ViewImage();
            panel.update_ImageHost();
            panel.update_sbi();

            // the focused ris img
            const img_ris = panel.ris_fc_Div.querySelector('img');
            const tu = getMeta(img_ris).tu; //thumbnail url
            if (tu)
                panel.loaderImage.src = tu;
            if (img_ris.getAttribute('loaded') === 'error') {
                if (tu)
                    panel.mainImage.src = tu;
            }


            // update sTitle href to point to the panel page
            panel.sTitle_Anchor.href = getPanelPage(getMeta(panel.ris_fc_Div));


            // rarbg torrent link
            let torrentLink = panel.q('.torrent-link');
            if (torrentLink) {
                torrentLink.style.display = /\/torrent\//gi.test(panel.pTitle_Anchor.href) ? // is torrent link?
                    'inline-block' : 'none';
            }
        }
        q() {
            return this.el.querySelector(...arguments);
        }
        qa() {
            return this.el.querySelectorAll(...arguments);
        }
        showRis() {
            for (const div of this.ris_Divs) {
                // debug && console.debug('showRis -> showImages.replaceImgSrc', div.querySelector('img'));
                const img = div.querySelector('img');
                showImages.replaceImgSrc(img).then(e => {
                    if (isLoaded(img) && div.matches('.irc_rist')) { // if is the focused ris
                        const mainImage = this.mainImage;
                        if (mainImage.src !== img.src)
                            console.log(
                                'haha!! got the mainImage to update when the ris loaded',
                                mainImage, img,
                                '\n', mainImage.src + '->\n    ' + img.src
                            );


                        mainImage.src = img.src;
                        mainImage.setAttribute('loaded', 'true');
                    }
                }).catch(e => {
                    console.warn('showRis failed', this.mainImage, img);
                });
            }
        }
        linkifyDescription() {
            var self = this;
            const descriptionEl = self.descriptionEl;

            if (!descriptionEl) {
                console.warn('linkifyDescription(): descriptionEl is not defined');
                return;
            }


            var descriptionAnchor = self.titleAndDescriptionDiv.querySelector('div.irc_asc > a.clickable-descr');
            if (!descriptionAnchor) {
                descriptionAnchor = $(descriptionEl.outerHTML.replace('<span', '<a').replace('</span', '</a'))
                    .text(descriptionEl.innerText);

                $(descriptionEl)
                    .before(descriptionAnchor)
                    .css({ display: 'none' });
            }

            $(descriptionAnchor)
                .addClass('clickable-descr')
                .attr({
                    href: GoogleUtils.url.gImgSearchURL + encodeURIComponent(cleanSymbols(descriptionAnchor.innerText)),
                    target: '_blank'
                });
        }
        inject_Download_ris() {
            var panel = this;
            // const risContainer = this.relatedImage_Container.parentNode;
            const targetEl = panel.q('.irc_msc, .irc_ris');//this.q('div.irc_ris');
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
            var html = `<a class="o5rIVb ${className}" target="${Preferences.page.defaultAnchorTarget}" href="${href}" data-ved="${dataVed}" rel="noreferrer" data-noload="" referrerpolicy="no-referrer" tabindex="0" data-ctbtn="2"<span class="irc_ho" dir="ltr" style="text-align: left;">Search&nbsp;by&nbsp;image</span></a>`;

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
                const element = createElement(`<a class="${className}" href="" target="${Preferences.page.defaultAnchorTarget}" rel="noreferrer" data-noload="" referrerpolicy="no-referrer" tabindex="0"  data-ved="" data-ctbtn="2" 
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
                        setStyleInHTML(ih, 'color', `${Preferences.loading.successColor} !important`);
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
            var siteSearch = createElement(`<a class="${spanClass} _r3 hover-click o5rIVb" target="${Preferences.page.defaultAnchorTarget}" rel="noreferrer" data-noload="" referrerpolicy="no-referrer" tabindex="0" href="${href}" data-ved="${dataVed}" data-ctbtn="2"<span class="irc_ho" dir="ltr" style="text-align: left;font-size: 12px;" >Site: ${hostname}</span></a>`);

            let ddgSearch = siteSearch.cloneNode(false);
            ddgSearch.innerText = '[DDGP]';
            ddgSearch.className = 'ddgSearch';

            siteSearch = this.addElementAfterSTitle(siteSearch, '', null, 'BOTTOM', 'div');
            siteSearch.appendChild(ddgSearch);
            return siteSearch;
        }

        update_SiteSearch() {
            const siteSearchAnchor = this.q('a.site-search');
            const hostname = getHostname(this.sTitle_Anchor.href);
            if (siteSearchAnchor) {
                siteSearchAnchor.innerText = 'site:' + hostname;
                siteSearchAnchor.href = (GoogleUtils.url.siteSearchUrl(getHostname(ImagePanel.focP.q('span a.irc_lth.irc_hol').href)));
            } else {
                console.warn('Site Search element not found:', siteSearchAnchor);
            }

            $('.ddgSearch').attr({
                'href': PProxy.DDG.proxy(this.pTitle_Anchor.href)
            });

            if (ublSitesSet.has(hostname))
                setStyleInHTML(this.sTitle_Anchor, 'color', `${Preferences.loading.successColor} !important`);
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
            this.mainImage.setAttribute('description', this.descriptionText);
            this.mainImage.setAttribute('img-subtitle', this.sTitle_Text);
            this.mainImage.setAttribute('download-name', this.sTitle_Text);
            this.mainImage.setAttribute('alt', this.sTitle_Text);
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
         * @param position - "BOTTOM", "LEFT", "RIGHT", "NONE"
         * @param parentTagName
         * @return {Element}
         * @private
         */
        addElementAfterSTitle(html, containerClassName, clickListener, position = 'BOTTOM', parentTagName = '') {
            // TODO: use jQuery here

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
        /**
         * Navigates to the previous related image in the irc_ris in the main panel.
         * @return {boolean} returns true if the successful (no errors occur)
         */
        prevRelImg() {
            try {
                if (!this.ris_fc_Div) return false;
                let previousElementSibling = this.ris_fc_Div.previousElementSibling;

                if (previousElementSibling) {
                    previousElementSibling.click();
                } else if (Preferences.panels.loopbackWhenCyclingRelatedImages) {
                    // List of relImgs without that last "View More".
                    const endRis = Array.from(this.ris_Divs).pop();
                    endRis.click();
                } else {
                    var prevArrow = ImagePanel.previousImage();
                    if (prevArrow && prevArrow.style.display !== 'none') { // if not on the first picture
                        ImagePanel.__tryToClickBottom_ris_image(30);
                    }
                }


                /* // if the image hasn't loaded (doesn't appear), then just go to the one after it
                 try {
                     const siblingImg = this.ris_fc_Div.querySelector('img');
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
        nextRelImg() {
            try {
                const ris_fc_Div = this.ris_fc_Div;
                if (!this.ris_fc_Div) {
                    return false;
                }
                let nextElSibling = ris_fc_Div.nextElementSibling;
                if (nextElSibling && !nextElSibling.classList.contains('irc_rismo')) {
                    nextElSibling.click();
                } else if (Preferences.panels.loopbackWhenCyclingRelatedImages) {
                    Array.from(this.ris_DivsAll)[0].click();
                    console.debug('clicking first irc_irs to loop, cuz there isn\'t any on the right', this.ris_DivsAll[0]);
                } else {
                    ImagePanel.nextImage();
                }

                return true;
            } catch (e) {
                console.warn(e);
            }
        }


        /**
         * Called every time a panel mutation is observed
         */
        onPanelMutation(mutations) {
            // debug && console.log('panelMutation()');
            this.__update();

            // this.mainImage.src = this.ris_fc_Url; // set image src to be the same as the ris

            if (Preferences.panels.autoShowFullresRelatedImages) {
                this.showRis()
            }

            (function updateSliderLimits() {
                // TODO: optimization: have a global `metaDatas` object that gets updated when new images are loaded, this prevents unneeded excessive calls
                // OR: use the already binded meta objects with the images
                const metaDatas = Array.from(getImgBoxes()).map(getMeta); // FIXME: this is expensive
                const dimensions = metaDatas.map(meta => [meta.ow, meta.oh]);
                const maxDimension = Math.max.apply(this, dimensions.map(wh => Math.max.apply(this, wh)));
                const minDimension = Math.min.apply(this, dimensions.map(wh => Math.min.apply(this, wh)));

                Components.minImgSizeSlider.max = maxDimension + minDimension % Components.minImgSizeSlider.step;
                Components.minImgSizeSlider.min = minDimension - minDimension % Components.minImgSizeSlider.step;

                const dlLimitSlider = document.querySelector('#dlLimitSlider');
                if (dlLimitSlider) {
                    dlLimitSlider.setAttribute('max', metaDatas.length.toString());
                    dlLimitSlider.value = metaDatas.length;
                    // TODO: also update the label value
                }
            })();

            disableDragging();
        }
        /**
         * called when changing from one panel to another (going left or right)
         */
        onSwitch() {
            console.log('panel.onSwitch()', this);
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

    if (Preferences.page.autoLoadMoreImages) {
        setInterval(function () {
            const btn = document.querySelector('#smbw');
            if (btn) {
                const event = new Event('click');
                btn.dispatchEvent(event);
            }
        }, 1000);
    }

    processLocation();

    elementReady('body').then(go);

    document.addEventListener('DOMContentLoaded', function () {
        // binding first letter of each menuItem ([A]ll, [I]mages, [V]ideos, ...)
        var menuItems = getMenuItems();
        for (const item of Object.keys(menuItems)) {
            Mousetrap.bind([`shift+${item.charAt(0).toLowerCase()}`], function (e) {
                var elChild = menuItems[item].firstElementChild;
                if(elChild) elChild.click();
            });
        }

        if (GoogleUtils.isOnGoogleImages || GoogleUtils.isOnGoogleImagesPanel) { // if Google images
            // automatically display originals if searching for a site:
            if (/site:.+/i.test(pageUrl.searchParams.get('q')) && !/img:/i.test(pageUrl.searchParams.get('tbs'))) {
                console.log('automatically display originals for "site:" search');
                shouldShowOriginals = true;
                showOriginals();
            }
        }
        // if NOT google images:
        else {
            // bind each result to the corresponding number
            for (let i = 0, results = document.querySelectorAll('div.srg > div'); i < results.length; i++) {
                Mousetrap.bind(String(i + 1), () => {
                    results[i].querySelector('a').click();
                });
                results[i].before(createElement(`<strong style="float: left;">${i + 1}</strong>`));
            }
        }

    }, false);

    // click showAllSizes link when it appears
    elementReady(Consts.Selectors.showAllSizes).then(el => el.click());

    // === start of function definitions ===

    function go() {
        if (GoogleUtils.isOnGoogleImages || GoogleUtils.isOnGoogleImagesPanel) {
            // directLinkReplacer.observe();

            bindKeys();


            // // iterating over the stored ubl sites
            // for (const ublHostname of GM_getValue(Consts.GMValues.ublSites, new Set())) ublSitesSet.add(ublHostname);
            // for (const ublURL of GM_getValue(Consts.GMValues.ublUrls, new Set())) ublMetas.add(ublURL);
            // for (const [ublHostname, data] of new Map(GM_getValue(Consts.GMValues.ublSitesMap, new Map()))) ublMap.set(ublHostname, data);
            // if (Preferences.ubl.periodicUblSaving)
            //     setInterval(storeUblSitesSet, 5000);

            ImagePanel.init();

            // wait for searchbar to load
            elementReady('#hdtb-msb').then(function () {
                injectGoogleButtons();

                // setting unsafe search URL
                {
                    // const ssDefault = document.querySelector('#ss-bimodal-default');
                    // if (ssDefault) {
                    //     enhanceLink(ssDefault);
                    //     ssDefault.href = unsafeSearchUrl();
                    //     ssDefault.onclick = function () {
                    //         location.assign(unsafeSearchUrl());
                    //     };
                    //     console.log('ssDefault', ssDefault);
                    // }
                }
            });


            // onImageBatchLoaded observe new image boxes that load
            observeDocument((mutations, me) => {
                // const addedImageBoxes = [].map.call(mutations, m => m.addedNodes[0])
                //     .filter(div => div && div.matches && div.matches('div.rg_bx:not(.rg_bx_listed)'));

                const addedImageBoxes = getImgBoxes(':not(.rg_bx_listed)');

                //Google direct links
                directLinkReplacer.checkNewNodes(mutations);

                if (!addedImageBoxes.length) {
                    return;
                }

                if (shouldShowOriginals) {
                    const thumbnails = [].map.call(getThumbnails(), div => div.closest('img[fullres-src]'))
                        .filter(img => !!img);

                    showOriginals(thumbnails);
                }
                onImageBatchLoaded(addedImageBoxes);
                updateDownloadBtnText();
                disableDragging();

            }, {
                    callbackMode: 0,

                    childList: true,
                    attributes: true,
                    // attributeFilter: ['href'],
                    subtree: true,
                });


        } else { // else if not google images
            
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

        // toggle forcedHostname
        Mousetrap.bind('shift+f5', function (e) {
            const wasForced = Preferences.location.forcedHostname.charAt(0) !== '!';
            const toForced = !wasForced && pageUrl.hostname !== Preferences.location.forcedHostname;

            console.log('shift+f5 [toggle forcedHostname]\nto:', toForced ? 'forced' : 'www.');

            if (toForced) {
                Preferences.location.forcedHostname = Preferences.location.forcedHostname.replace(/^!/, '');
            } else {
                Preferences.location.forcedHostname = '!' + Preferences.location.forcedHostname;
                pageUrl.hostname = 'www.google.com';
            }

            Preferences.store();
            var reload = !processLocation();

            if (reload) {
                console.log('location didn\'t change');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        });

        // S S: SafeSearch toggle
        Mousetrap.bind('s s', function () {
            console.log('safeSearch toggle');
            const ssLink = document.querySelector('#ss-bimodal-strict');
            // const ussLink = document.querySelector('#ss-bimodal-default');

            if (ssLink) {
                console.log('sslink', ssLink.href, ssLink);
                ssLink.click(); // to safe search
            } else {
                // to unsafe search
                location.assign(unsafeSearchUrl());
            }
        });

        Mousetrap.bind(['u'], () => {
            location.assign(unsafeSearchUrl());
        });

        Mousetrap.bind(['c c'], cleanupSearch);
        // to https://yandex.com/images/search?text=
        Mousetrap.bind('y d x', () => {
            var x = 'https://yandex.com/images/search?text=' + encodeURIComponent(new URL(location.href).searchParams.get('q'));
            console.log('Yandex url = ', x);
            location.assign(x);
        });


        Mousetrap.bind(['alt+a'], () => {
            (!document.querySelector('#itp_animated').firstElementChild ? document.querySelector('#itp_').firstElementChild : document.querySelector('#itp_animated').firstElementChild).click();
        });
        Mousetrap.bind(['D'], () => {
            document.querySelector('#downloadBtn').click();
        });
        Mousetrap.bind(['h'], () => {
            document.querySelector('#hideFailedImagesBox').click();
        });
        Mousetrap.bind(['g'], () => {
            document.querySelector('#GIFsOnlyBox').click();
        });
        Mousetrap.bind(['esc', 'escape'], removeHash);


        // keys that don't need a focusedPanel and all those other variables
        Mousetrap.bind(['ctrl+alt+r'], function () {
            // not implemented
            console.log('not implemented, find something to put here');
        });
        Mousetrap.bind(['/'], function (e) { // focus search box
            const searchBar = document.querySelector(Consts.Selectors.searchBox);
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
            Components.minImgSizeSlider.stepDown()
        });
        Mousetrap.bind([']'], function (e) {
            Components.minImgSizeSlider.stepUp();
        });


        Mousetrap.bind([`'`], function (e) {
            Preferences.panels.loopbackWhenCyclingRelatedImages = !Preferences.panels.loopbackWhenCyclingRelatedImages;
            GM_setValue('LOOP_RELATED_IMAGES', Preferences.panels.loopbackWhenCyclingRelatedImages);
            console.log('LOOP_RELATED_IMAGES toggled to:', Preferences.panels.loopbackWhenCyclingRelatedImages);
        });
        Mousetrap.bind([''], function openTorrent(e) {
            console.debug('Torrent search');
            openInTab(GoogleUtils.url.gImgSearchURL + encodeURIComponent('+torrent +rarbg ' + cleanSymbols(ImagePanel.focP.bestNameFromTitle)));
        });
        Mousetrap.bind(['v'], function (e) {
            var btn_Save = ImagePanel.focP.q('.i15087');
            console.debug('btn_Save', btn_Save);
            if (!!btn_Save) btn_Save.click();
        });
        Mousetrap.bind(['c'], function collection(e) {
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
            openInTab(currentImgUrl);
        });
        Mousetrap.bind([',', 'up', 'numpad8'], function (e) { // ▲ Prev/Left relImage
            ImagePanel.prevRelImg();
            e.preventDefault();
        }, 'keydown');
        Mousetrap.bind(['.', 'down', 'numpad2'], function (e) {// Next related mainImage
            ImagePanel.nextRelImg();
            e.preventDefault();
        }, 'keydown');
        Mousetrap.bind(['o'], ImagePanel.showRis);
        Mousetrap.bind(['h'], function (e) {
            document.querySelector('#rcnt').style.visibility = (/hidden/i).test(document.querySelector('#rcnt').style.visibility) ? 'visible' : 'hidden';
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
        const searchBar = document.querySelector(Consts.Selectors.searchBox);
        searchBar.value = cleanDates(searchBar.value).replace(/\s+|[.\-_]+/g, ' ');
    }

    // return true when there will be a change
    function processLocation() {
        //TODO: move this to UrlUtils
        function equalUrls(url1, url2, hashSensitive = false) {
            const equalUrlSearchParams = function equalUrlSearchParams(url1, url2) {
                const sp1 = url1.searchParams;
                const sp2 = url2.searchParams;
                sp1.sort();
                sp2.sort();

                const s1 = sp1.toString();
                const s2 = sp2.toString();
                const eq = s1 === s2;

                console.debug(
                    '\nequal: ' + eq,
                    `\n"${s1}"\n===\n"${s2}"`
                );
                return (eq);
            };
            // console.log(url1.toString() + '\n' + url2.toString());
            return (
                equalUrlSearchParams(url1, url2) &&
                (url1.hostname === url2.hostname) &&
                (!hashSensitive || url1.hash === url2.hash)
            );
        }

        URL.prototype.equal = function (other, hashSensitive) {
            return equalUrls(this, other, hashSensitive);
        };


        // switch to specific google domain/hostname (like ipv4.google.com)
        if (typeof (Preferences.location.forcedHostname) === 'string' && Preferences.location.forcedHostname.charAt(0) !== '!') {
            pageUrl.hostname = Preferences.location.forcedHostname;
        }

        // URL args: Modifying the URL and adding arguments, such as specifying the size
        if (Preferences.location.customUrlArgs && Object.keys(Preferences.location.customUrlArgs).length) {

            for (const key in Preferences.location.customUrlArgs) {
                if (Preferences.location.customUrlArgs.hasOwnProperty(key)) {
                    if (pageUrl.searchParams.has(key))
                        pageUrl.searchParams.set(key, Preferences.location.customUrlArgs[key]);
                    else {
                        pageUrl.searchParams.append(key, Preferences.location.customUrlArgs[key]);
                    }
                }
            }

            console.debug('new location:', pageUrl.toString());
        }

        if (!equalUrls(new URL(location.href), pageUrl)) {
            location.assign(pageUrl.toString());
            return true;
        }
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
            throw new Error('Stopping execution due to missing imports:\n' + missing.join('\n- '));
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
        for (const metaEl of document.querySelectorAll('div.rg_meta')) {
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

    /** @param visibleOnly {boolean}: optional: set to true to exclude thumbnails that aren't visible
     * @returns {NodeListOf<HTMLImageElement>} */
    function getThumbnails(visibleOnly = false) {
        // language=CSS
        const selector = 'div.rg_bx > a.rg_l[jsname="hSRGPd"] > img' +
            (visibleOnly ? ':not([style*=":none;"]):not([visibility="hidden"])' : '')
            ;
        return document.querySelectorAll(selector);
    }

    function updateQualifiedImagesLabel(value = 0) {
        //FIXME: this is a waste of resources, we're only using the length
        if (!value) value = getQualifiedGImgs({}).length;

        const satCondLabel = document.querySelector('#satCondLabel');
        if (satCondLabel)
            satCondLabel.innerHTML = value + ' images satisfying conditions';

        const dlLimitSlider = document.querySelector('#dlLimitSlider');
        if (dlLimitSlider && dlLimitSlider.value < value) {
            dlLimitSlider.value = value;
            document.querySelector('#dlLimitSliderValue').innerText = value;
        }
    }
    function highlightSelection() {
        const sliderValueDlLimit = this.value;
        document.querySelector('#dlLimitSliderValue').innerHTML = sliderValueDlLimit;

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
    // TODO: use jquery to create the elements, it'll be much cleaner
    function injectGoogleButtons() {
        console.log('injectGoogleButtons()');
        const controlsContainer = createElement('<div id="google-controls-container"</div>');
        /*q('#abar_button_opt').parentNode*/ //The "Settings" button in the google images page

        // auto-click on "tools" if on Google Images @google-specific
        const toolsButton = document.querySelector('.hdtb-tl');
        if (!!toolsButton) {
            if (!toolsButton.classList.contains('hdtb-tl-sel')) { // if the tools bar is not already visible (not already clicked)
                toolsButton.click();
            } else console.warn('tools button already activated');
        } else console.warn('tools button not found');


        // buttons
        const createGButton = (id, innerText, onClick) => {
            const button = createElement(`<button class="${Consts.ClassNames.buttons} sg sbtn hdtb-tl" id="${id}">${innerText.replace(/\s/g, '&nbsp;')}</button>`);
            if (typeof (onClick) === 'function') {
                button.onclick = function () {
                    onClick();
                };
            }
            return button;
        };


        /**
         * @param {string} id    the checkbox element id
         * @param {string=} labelText
         * @param {Function=} onChange on box change, Function(checked: bool) this: checkboxEl
         * @param {bool=} checked
         * @returns {HTMLDivElement} this label element contains a checkbox input element
         */
        const createGCheckBox = (id, labelText='label', onChange=()=>null, checked=null) => {
            checked = GM_getValue(id, !!checked); // load value, fallback to passed value

            const $container = $('<div>').attr({
                'id': id.trim()+'-div',
                'class': 'sg',
            }).css({
                'display': 'inline',
            });
            const $checkbox = $('<input>').attr({
                'id': id,
                'type': 'checkbox',
                'checked': checked,
            });
            const $label = $(`<label for="${id}">${labelText.replace(/\s/g, '&nbsp;')}</label>`);

            $container.append($label).append($checkbox);

            $container.change(function (e) {
                if (typeof onChange === 'function')
                    onChange.call($checkbox[0], e);
                
                GM_setValue(id, e.checked);
            });
            
            return $container[0];
        };

        // Check boxes
        const cbox_ShowFailedImages = createGCheckBox('hideFailedImagesBox', 'Hide failed images', function (e) {
            setVisibilityForImages(!e.checked, isFailedImage);
            Preferences.loading.hideFailedImagesOnLoad = !e.checked; // remember the preference
        }, Preferences.loading.hideFailedImagesOnLoad);
        const cbox_GIFsOnly = createGCheckBox('GIFsOnlyBox', 'GIFs only', function (e) {
            setVisibilityForImages(!e.checked, isGif, false, true); // hide nonGifs when NOT checked
        }, false);
        const cbox_UseDdgProxy = createGCheckBox('useDdgProxyBox', 'Use proxy', function (e) {
                Preferences.loading.useDdgProxy = e.checked;
                updateQualifiedImagesLabel();
            },
            Preferences.loading.useDdgProxy
        );
        const cbox_GIFsException = createGCheckBox('GIFsExceptionBox', 'Always download GIFs');
        const cbox_OnlyShowQualifiedImages = createGCheckBox('OnlyShowQualifiedImages', 'Only show qualified images',
            null,
            // (e) => GM_setValue('OnlyShowQualifiedImages', e.checked),
            false
        );
        const cbox_ZIP = createGCheckBox('zipInsteadOfDownload', 'ZIP', function (e) {
            updateDownloadBtnText();
        }, true);
        cbox_ZIP.style.padding = '0px';

        const cbox_closeAfterDownload = createGCheckBox('closeAfterDownload', 'close after download', null, true);


        const isFailedImage = (img_bx) => img_bx.getAttribute('loaded') === 'false' || img_bx.classList.contains(Consts.ClassNames.FAILED_PROXY);


        const constraintsContainer = (function () {
            // todo: see this nice link, maybe use it one day https://css-tricks.com/value-bubbles-for-range-inputs/

            const default_slider_minImgSize_value = 250;
            Components.minImgSizeSlider = createElement(`<input id="minImgSizeSlider" type="range" min="0" max="3000" value="${default_slider_minImgSize_value}" step="50">`);

            const sliderReading_minImgSize = createElement(`<label for="minImgSizeSlider" id="minImgSizeSliderValue">${Components.minImgSizeSlider.value}x${Components.minImgSizeSlider.value}</label>`);
            Components.minImgSizeSlider.oninput = function () {
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
                    exception4smallGifs: null,
                    ignoreDlLimit: true
                }).length);
            };
            Components.minImgSizeSlider.onchange = function () {
                // TODO: maybe this can be done using a CSS, rather than manually changing it every time
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
            tr1.appendChild(Components.minImgSizeSlider);
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
            showOriginals();
        });

        const link_animated = createElement(`<a class="sg q qs" href="${location.pathname + location.search + '&tbs=itp:animated'}"><u>A</u>nimated</a>`);
        const btn_preload = createGButton('preloadBtn', 'Preload images ↻', function () {
            const imgLinks = Array.from(document.querySelectorAll('a.rg_l[href]'));
            console.log('imgLinks:', imgLinks);

            for (const a of imgLinks) {
                const img = a.querySelector('img');
                const dlName = cleanGibberish(getMeta(img)['pt']);

                // img.setAttribute('download-name', dlName);
                img.setAttribute('alt', dlName);
                console.log('Preloading image:', `"${dlName}"`, !isBase64ImageData(img.src) ? img.src : 'Base64ImageData');
            }
        });
        const btn_downloadJson = createGButton('dlJsonBtn', 'Download JSON {}', downloadJSON);
        const btn_trimSiteLeft = createGButton('trimSiteLeft', '[', siteSearch_TrimLeft);

        const btn_download = createGButton('downloadBtn', 'Download EVERYTHING ⇓', downloadImages);
        btn_download.style.margin = '20px';
        btn_download.style.border = '20px';
        btn_download.innerHTML = cbox_ZIP.checked ? 'ZIP&nbsp;images' : `Download&nbsp;⇓`;

        var downloadPanel = createElement('<div id="download-panel" style="display: block;"></div>');

        // Appending buttons to downloadPanel
        for (const el of [cbox_ZIP, cbox_closeAfterDownload, btn_download, btn_preload, btn_downloadJson, constraintsContainer]) {
            downloadPanel.appendChild(el);
        }

        // todo: move this to another function, where it will also be appended with the web search (not only the image search)
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
        divider.after(btn_dispOgs, cbox_ShowFailedImages, cbox_GIFsOnly, cbox_UseDdgProxy, cbox_GIFsException, cbox_OnlyShowQualifiedImages, link_animated, searchEngineSelect, pathBox, downloadPanel);
        constraintsContainer.after(satCondLabel);
        downloadPanel.appendChild(createElement(`<div id="progressbar-container"></div>`));


        return createAndGetNavbar().then(function (topnavContentDiv) {
            const gNavbar = document.querySelector('#rshdr');
            topnavContentDiv.before(gNavbar, document.querySelector('#searchform'));
            topnavContentDiv.appendChild(controlsContainer);
        });
    }

    /**
     * @param {HTMLImageElement[]=} thumbnails - optional
     * @returns {Promise[]}
     */
    function showOriginals(thumbnails) {
        thumbnails = thumbnails || getThumbnails();

        return [].map.call(
            thumbnails,
            // some may not have been replaced with direct links yet, so wait until that happens then showImages
            img => img && img.matches('img[fullres-src]') ? // HACK: we shouldn't need this, elementReady should handle this but ok fine it works...
                showImages.replaceImgSrc(img) :
                elementReady(img => img && img.matches('img[fullres-src]'))
                    .then(() => showImages.replaceImgSrc(img))
        );
    }

    /**
     * clears the selection effects (when filtering and choosing images)
     */
    function clearAllEffects() { // remove highlighting of elements
        console.warn('clearAllEffects()');

        const effectClassNames = ['highlight', 'drop-shadow', 'transparent', 'sg-too-small', /*'qualified-dimensions',*/ 'sg-too-small-hide', 'in'];

        const selector = '.' + effectClassNames.join(', .');
        for (const el of document.querySelectorAll(selector)) {
            el.classList.remove(...effectClassNames); // remove all effect effectClassNames
            el.classList.add('out');
        }
    }

    /**
     * Returns a list of qualified image metas
     * @return {Meta[]}
     */
    function getQualifiedUblImgMetas() {
        const condition = meta => !(meta.imgEl.classList.contains(Consts.ClassNames.FAILED) || meta.imgEl.classList.contains(Consts.ClassNames.FAILED_PROXY) // not marked as failed
            && meta && Math.max(meta.ow, meta.oh) >= 120); // not too small;

        return Array.from(getImgBoxes(' a.rg_l img[loaded="true"], a.rg_l img[loaded="true"]'))
            .map(getMeta)
            .filter(condition);
    }

    function downloadImages() {
        const zipBox = document.querySelector('#zipInsteadOfDownload');
        if (zipBox && zipBox.checked) {
            if (!zip || Object.keys(zip.files).length < 1) {
                gZipImages();
            } else {
                zip && zip.genZip();
            }
        } else {
            if (currentDownloadCount >= document.querySelector('#dlLimitSlider').value) {
                currentDownloadCount = 0;
            } else {
                console.log('currentDownloadCount < dlNumSlider.value');
            }
            const qualifiedGImgs = Array.from(getQualifiedGImgs({}));

            let i = 0;
            const btns = document.querySelectorAll('.text-block.download-block');
            var interval = setInterval(function () {
                if (i < Math.min(btns.length, document.querySelector('#minImgSizeSlider').value))
                    btns[i++].click();
                else
                    clearInterval(interval);
            }, 100);
        }
    }

    /**
     * @param {(Element|Meta)} img_bx - image box or image or meta
     * @returns {boolean}
     */
    function isGif(img_bx) {
        const meta = (img_bx instanceof Element) ? getMeta(img_bx) : img_bx;
        return meta.ity === 'gif' || /\.gif($|\?)/.test(meta.ou);
    }

    // if the url is a thumbnail url
    function isLoaded(img) {
        return !/encrypted-tbn0\.gstatic\.com/.test(img.src) && img.getAttribute('loaded') !== 'error';
    }

    //FIXME: this is ugly
    //  - fix the entire structure of selecting and querying qualified images
    //  - fix params
    /**
     * @param parameters
     * @param parameters.exception4smallGifs
     * @param parameters.ignoreDlLimit
     * @returns {(ImgBox|HTMLImageElement)[]} they will have img.url, img.
     *
     */
    function getQualifiedGImgs(parameters = {}) {
        let { exception4smallGifs, ignoreDlLimit = false } = parameters;

        const dlLimitSlider = document.querySelector('#dlLimitSlider');
        const dlLimit = dlLimitSlider ? dlLimitSlider.value : Number.MAX_SAFE_INTEGER;

        return [].filter.call(document.querySelectorAll('img.rg_ic.rg_i:not([loaded="error"])'), (img, i) => {
            const qualDim = img.satisfiesDimensions || exception4smallGifs && isGif(img.meta);
            return (qualDim && (ignoreDlLimit || i < dlLimit))
        });
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
    function saveUblSites() {
        storeUblSitesSet();
        console.log('Site links of unblocked images:', Array.from(ublSitesSet));
    }

    function enhanceImageBox(imageBox) {
        imageBox.classList.add('rg_bx_listed');
        const img = imageBox.querySelector('img.rg_i');
        if (!img) return;

        // defining properties
        imageBox.img = img;
        img.showOriginal = () => showImages.replaceImgSrc(img, img.closest('a'));
        img.__defineGetter__('meta', () => getMeta(img));
        img.__defineGetter__('satisfiesDimensions', () =>
            img.meta.ow >= Components.minImgSizeSlider.value && img.meta.oh >= Components.minImgSizeSlider.value
        );


        /**
         * Adds a mouseover listener to showOriginal if you hover over an image for a moment
         */
        const addHoverListener = (function () {
            let pageX = 0;
            let pageY = 0;

            return function addHoverListener(imgBx) {
                let timeout = null;
                const checkAndResetTimer = e => {
                    if (!(pageX === e.pageX && pageY === e.pageY)) {
                        // console.log(`mouse has moved, is: (${e.clientX}, ${e.clientY}) was: (${pageX}, ${pageY})`);
                        clearTimeout(timeout);
                    }
                };

                const onMouseUpdate = (e) => {
                    if (e[Preferences.shortcuts.hotkey]) {
                        imgBx.img.showOriginal();
                    }

                    checkAndResetTimer(e);
                    timeout = setTimeout(function () {
                        checkAndResetTimer(e);
                        imgBx.img.showOriginal();
                    }, Preferences.page.showImgHoverPeriod);
                    imgBx.mouseX = e.clientX;
                    imgBx.mouseY = e.clientY;
                };

                imgBx.addEventListener('mousemove', onMouseUpdate, false);
                imgBx.addEventListener('mouseenter', onMouseUpdate, false);
                imgBx.addEventListener('mouseout', () => {
                    clearTimeout(timeout);
                });
            }
        })();

        /**
         * Add small text box containing image extension
         * @param {HTMLDivElement} imgBox
         */
        function addImgExtensionBox(imgBox) {
            if (imgBox.querySelector('.text-block')) return;

            const img = imgBox.querySelector('img.rg_ic.rg_i');
            const meta = getMeta(img);
            const ext = meta ? meta.ity : img.src.match(/\.(jpg|jpeg|tiff|png|gif)($|[?&])/i);

            if (!(ext && ext.toUpperCase))
                return;

            const textBox = $('<div class="text-block ext ext-' + ext + '">')
                .text(ext.toUpperCase())[0];
            img.after(textBox);
            imgBox.querySelector('a.irc-nic.isr-rtc').classList.add('ext', `ext-${ext}`);
        }
        function addImgDownloadButton(imgBox) {
            if (imgBox.querySelector('.download-block'))
                return;

            const img = imgBox.querySelector('img.rg_i');
            const link = img.closest('a');
            const meta = getMeta(img);

            const downloadImage = function (e = {}) {
                const src = img.getAttribute('loaded') === 'true' ? img.src : img.getAttribute('fullres-src') || meta.ou;
                const fileName = unionTitleAndDescr(meta.s, unionTitleAndDescr(meta.pt, meta.st)) + meta.ity;
                download(src, fileName, { fileExtension: meta.ity });
                e.preventDefault();
                e.stopImmediatePropagation();
                e.stopPropagation();
            };
            const $dlBtn = $('<div class="text-block download-block""></div>').css({
                'background-color': 'dodgerblue',
                'margin-left': '35px',
            }).text('[⇓]').click(downloadImage);

            link.addEventListener('click', function (e) {
                if (e[Preferences.shortcuts.hotkey]) {
                    downloadImage(e); // it already prevents default and stops propagation
                }
            });

            img.after($dlBtn[0]);
        }

        // just wait until exists `meta`, cuz some of them didn't load yet
        elementReady(() => getMeta(imageBox)).then(function () {
            addImgExtensionBox(imageBox);
            addImgDownloadButton(imageBox);
        });

        // choosing one of them (prioritizing the description over the title)
        img.__defineGetter__('alt', () => {
            var title = [img.meta.pt, img.meta.s].join('_');
            img.setAttribute('alt', title);
            return title;
        });
        img.__defineGetter__('name', () => {
            var title = [img.meta.pt, img.meta.s].join('_');
            img.setAttribute('name', title);
            return title;
        });


        img.classList.add('blur');

        addHoverListener(imageBox);
    }

    /**
     * Called every 20 or so images, the image boxes are passed
     * @param addedImageBoxes
     */
    function onImageBatchLoaded(addedImageBoxes) {
        console.log('onImageBatchLoaded()');
        // if (imageSet.contains(addedImageBoxes)) return;
        // else imageSet.add(addedImageBoxes);

        for (const imageBox of addedImageBoxes) {
            enhanceImageBox(imageBox);
        }

        (function updateDlLimitSliderMax() {
            const numImages = getImgBoxes().length;

            const dlLimitSlider = $('#dlLimitSlider');

            if (dlLimitSlider) {
                dlLimitSlider.max = numImages;
                dlLimitSlider.value = numImages;

                $('#dlLimitSliderValue').innerHTML = numImages;
            }
        })();

        try {
            updateQualifiedImagesLabel();
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * @param {(HTMLImageElement|HTMLDivElement)} img image element, either <img class="rg_ic rg_i" ....> in .rg_bx
     * @param minified
     * @return {Meta}
     */
    function getMeta(img, minified = false) {

        var div;
        if (img.tagName === 'DIV') {
            div = img;
            img = div.querySelector('img');
        } else {
            div = img.closest('div.irc_rimask, div.rg_bx');
            // nearest parent div container, `div.rg_bx` for thumbnails and `div.irc_rimask` for related images
        }


        var metaObj = {};
        if (!img)
            return metaObj;
        if (img._meta && Object.keys(img._meta).length !== 0)
            return img._meta;


        try {
            var rg_meta = div.querySelector('.rg_meta');
            if (!rg_meta) {// this is probably gonna be the case for ris
                var selector = '[data-ved="' + $.escapeSelector(div.getAttribute('data-ved')) + '"].rg_bx div.rg_meta';
                rg_meta = document.querySelector(selector);
            }

            metaObj = JSON.parse(rg_meta.innerText);

            metaObj.src = img.src;
            metaObj.dim = [metaObj.ow, metaObj.oh];
            metaObj.imgEl = img;
            img._meta = metaObj;

        } catch (e) {
            metaObj = getImgMetaById(img.id);
            console.warn(e, img);
        }

        if (minified) {
            metaObj = cleanMeta(metaObj);
        }

        return metaObj;
    }

    //TODO: it's still not disabling dragging, need to call it in more places
    function disableDragging() {
        if (Preferences.page.disableDragging)
            document.querySelectorAll('*').forEach(el => {
                el.draggable = false;
            });
    }

    /**
     * @author: https://greasyfork.org/en/scripts/19210-google-direct-links-for-pages-and-images/code
     * I just changed it to a module so I could call the methods at multiple places
     * Google: Direct Links for Pages and Images
     */
    function googleDirectLinksInit() {
        var o = {};
        o.count = 0;
        o.debug = false;

        // web pages:            [0] url?url=
        // images:               [1] imgres?imgurl=
        // custom search engine: [2] url?q=
        // malware:              [3] interstitial?url=
        const re = /\b(url|imgres)\?.*?\b(?:url|imgurl|q)=(https?\b[^&#]+)/i;

        /** returns full path, not just partial path */
        const normalizeUrl = (function () {
            const fakeLink = document.createElement('a');

            return function (url) {
                fakeLink.href = url;
                return fakeLink.href;
            }
        })();

        /**
         * - purifyLink
         * - set rel="noreferrer", referrerpolicy="no-referrer"
         * - stopImmediatePropagation onclick */
        const enhanceLink = function (a) {
            // at this point, href= the gimg search page url
            /** stop propagation onclick */
            var purifyLink = function (a) {
                if (/\brwt\(/.test(a.getAttribute('onmousedown'))) {
                    a.removeAttribute('onmousedown');
                }
                if (a.parentElement && /\bclick\b/.test(a.parentElement.getAttribute('jsaction') || '')) {
                    a.addEventListener('click', function (e) {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                    }, true);
                }
            };

            purifyLink(a);
            a.setAttribute('rel', 'noreferrer');
            a.setAttribute('referrerpolicy', 'no-referrer');
        };

        /** make thumbnail info-bar clickable
         *  @faris: storing "fullres-src" attribute to images
         */
        const enhanceThumbnail = function (link, url) {
            const phref = link.getAttribute('phref');

            // @faris, storing fullres-src attribute to images
            var imgs = [].slice.call(link.querySelectorAll('div~img'));
            imgs.length && imgs.forEach(function (img) {
                o.debug && console.log('img fullres-src="' + link.href + '"');
                img.setAttribute('fullres-src', link.href); //@faris

                //DEBUG: checking what the hell is causing "&reload=on"
                img.__defineGetter__('src', () => img.getAttribute('src'));
                img.__defineSetter__('src', (value) => {
                    if (/&reload=on/.test(value))
                        o.debug && console.log('image has been set with "&reload=on"!!!!!', img, value, new Error().stack);

                    return img.setAttribute('src', value.replace(/&reload=on$/, ''));
                });

                // img.phref = phref; //@faris
            });

            var infos = [].slice.call(link.querySelectorAll('img~div.rg_ilmbg'));
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


            //@faris
            var footLink = link.parentElement.querySelector('a.irc-nic');
            if (footLink && !footLink.parentElement.querySelector('.phref')) {
                // splitting the 2 lines of the footlink to 2 links, one with the phref
                const footLinkTop = footLink.cloneNode();
                footLinkTop.classList.add('phref');

                enhanceLink(footLink);

                footLinkTop.phref = phref;
                footLinkTop.setAttribute('phref', phref);
                footLinkTop.href = phref;
                footLinkTop.setAttribute('href', phref);

                footLink.phref = phref;
                footLink.setAttribute('phref', phref);
                footLink.href = phref;
                footLink.setAttribute('href', phref);
                footLink.classList.add('panel-page', 'phref');

                enhanceLink(footLinkTop);

                // get first div and move it up
                footLinkTop.appendChild(footLink.querySelector('div'));
                footLink.before(footLinkTop);

                // hold hotkey and click to site:search
                {

                    var siteSpan = createElement('<span class="site-span" style="display:none">site:</span>');
                    footLink.querySelector('div').firstElementChild.before(siteSpan);

                    const __restoreFootlink = function (theLink) {
                        theLink.setAttribute('href', theLink.oghref || theLink.getAttribute('href'));
                        siteSpan.style.display = 'none';
                    };

                    var handleHover = function (e) {
                        if (e[Preferences.shortcuts.hotkey]) { // change to site:search
                            this.oghref = this.href;
                            const sitesearchUrl = GoogleUtils.url.siteSearchUrl(this.querySelector('div > span:nth-child(2)').innerText);
                            this.setAttribute('href', sitesearchUrl);
                            siteSpan.style.display = 'inline';
                        } else {
                            __restoreFootlink(this);
                        }
                    };


                    footLink.addEventListener('key', e => e[Preferences.shortcuts.hotkey] && handleHover(e), false);
                    footLink.addEventListener('mouseenter', handleHover, false);
                    footLink.addEventListener('mousemove', handleHover, false);
                    footLink.addEventListener('mousedown', handleHover, false);
                    footLink.addEventListener('mouseout', e => __restoreFootlink(footLink), false);
                    footLink.addEventListener('mouseleave', e => __restoreFootlink(footLink), false);
                }
            }

        };

        /**
         * replace redirect and dataUris
         *
         * @param {*|HTMLAnchorElement} link
         * @param {string=} url
         */
        o.restore = function (link, url) {
            var oldUrl = link.getAttribute('href') || '';
            var newUrl = url || oldUrl;
            newUrl = newUrl.replace(/&reload=on/, '');

            var matches = newUrl.match(re);
            if (matches) {
                o.debug && console.log('restoring', link._x_id, newUrl);

                link.phref = oldUrl;
                link.setAttribute('phref', oldUrl); //@faris just saving the old panel href

                link.href = decodeURIComponent(matches[2]);
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


        const filter = a => !(a.parentElement && a.parentElement.classList.contains('text-block')) &&
            // /^\/imgres\?imgurl=/.test(a.getAttribute('href')) &&
            a.matches('.rg_l')
            ;

        const handler = function (a) {
            if (!filter(a)) //@faris
                return;

            if (a._x_id) {
                o.restore(a);
                return;
            }
            // console.log('Anchor passed the test with href="' + a.href + '"', a);

            a._x_id = ++o.count;
            o.debug && a.setAttribute('x-id', a._x_id);

            a.__defineSetter__('href', function setter(v) {
                // in case an object is passed by clever Google
                o.restore(this, String(v));
            });
            a.__defineGetter__('href', function getter() {
                o.debug && console.log('get', this._x_id, this.getAttribute('href'), this);
                return normalizeUrl(this.getAttribute('href'));
            });

            if (/^_(?:blank|self)$/.test(a.getAttribute('target')) ||
                /\brwt\(/.test(a.getAttribute('onmousedown')) ||
                /\bmouse/.test(a.getAttribute('jsaction')) ||
                a.parentElement && /\bclick\b/.test(a.parentElement.getAttribute('jsaction'))) {
                enhanceLink(a);
            }

            o.restore(a);
        };

        // observe
        o.checkNewNodes = function (mutations) {
            o.debug && console.log('State:', document.readyState);
            if (mutations.target) {
                o.checkAttribute(mutations);
            } else {
                mutations.forEach && mutations.forEach(o.checkAttribute);
            }
        };
        o.checkAttribute = function (mutation) {
            var target = mutation.target;

            if (target && target.tagName === 'A') {
                if ((mutation.attributeName || mutation.attrName) === 'href') {
                    o.debug && console.log('restore attribute', target._x_id, target.getAttribute('href'));
                }
                handler(target);
            } else if (target instanceof Element) {
                target.querySelectorAll('a').forEach(handler);
            }
        };


        o.observe = () => {
            var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
            if (MutationObserver) {
                o.debug && console.log('MutationObserver: true');
                new MutationObserver(o.checkNewNodes).observe(document.documentElement, {
                    childList: true,
                    attributes: true,
                    attributeFilter: ['href'],
                    subtree: true
                });
            } else {
                o.debug && console.log('MutationEvent: true');
                document.addEventListener('DOMAttrModified', o.checkAttribute, false);
                document.addEventListener('DOMNodeInserted', o.checkNewNodes, false);
            }
        };

        return o;
    }

    function getPanelPage(meta) {
        var img;
        if (meta instanceof HTMLImageElement) {
            img = meta;
            meta = getMeta(img);
        }

        var currentParams = Object.fromEntries(new URL(location.href).searchParams.entries());

        var data = {
            'imgrefurl': meta.ru,
            'docid': meta.rid,
            'tbnid': meta.id,
            'ved': !img ? '' : img.closest('[data-ved]').getAttribute('data-ved'), // somehow get this from the div
            'w': meta.ow,
            'h': meta.oh,
            // 'itg':,
            // 'hl':,
            // 'bih':,
            // 'biw':,
            // 'q':,
        };
        var combined = $.extend(currentParams, data);


        return normalizeUrl('/imgres?' + $.param(combined));
    }

    function getUblImages() {
        return document.querySelectorAll('img[src][loaded="true"]:not([proxy])');
    }
    function getUblHostnames() {
        return Array.from(new Set(Array.from(getUblImages()).map(img => getHostname(img.src))));
    }

    /**
     * used for trimming right and trimming left a search query
     * @param str
     */
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
        const searchBox = document.querySelector(Consts.Selectors.searchBox);

        const trimmedSiteSearch = parseSearchBarString(searchBox.value).trimLeft();

        console.log(`siteSearch_TrimLeft("${searchBox.value}") = "${trimmedSiteSearch}"`);

        if (searchBox.value === trimmedSiteSearch) {// don't change if already the same
            return;
        }

        searchBox.value = trimmedSiteSearch;
        searchBox.form.submit();
    }

    function siteSearch_TrimRight() {
        const searchBox = document.querySelector(Consts.Selectors.searchBox);

        // for regex breakdown, see https://regex101.com/r/gq9In1/1
        const trimmedSiteSearch = parseSearchBarString(searchBox.value).trimRight();
        console.log(`siteSearch_TrimRight("${searchBox.value}") = "${trimmedSiteSearch}"`);

        if (searchBox.value === trimmedSiteSearch) {// don't change if already the same
            return;
        }
        searchBox.value = trimmedSiteSearch;
        searchBox.form.submit();
    }

    function openInTab(url, target = '_blank') {
        window.open(url, target);
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
        const downloadBtn = document.querySelector('#downloadBtn');
        const zipCbox = document.querySelector('#zipInsteadOfDownload');
        if (zipCbox && downloadBtn) {
            downloadBtn.innerHTML = zipCbox.checked ?
                (!downloadBtn.classList.contains('genzip-possible') ? 'ZIP' : 'Download&nbsp;ZIP&nbsp;⇓') : // "zip" or "download zip"
                'Download&nbsp;⇓';
        }
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


    /**
     * This is the URL with safe search off
     *
     * '#ss-bimodal-strict' to go from unsafe to strict
     * '#ss-bimodal-default' to go from strict to unsafe
     *
     * @returns {string|null} the unsafe url, otherwise returns nothing
     * @param {string} href
     */
    function unsafeSearchUrl(href = location.href) {
        const url = new URL(href);
        url.hostname = 'ipv4.google.com';
        url.searchParams.set('safe', 'off');
        return url.toString();
    }

    function gZipImages() {
        zip = zip || new JSZip();
        zip.file('info.json', new Blob([getResultsJSON({
            minify: true,
            stringify: true,
            base64urls: false
        })], { type: 'text/plain' }));

        // window.onunload = () => zip.genZip();

        zip.onGenZip = e => {
            window.onbeforeunload = null;
            window.onunload = null;
            var closeAfterZip = document.querySelector('#closeAfterDownload');
            if (closeAfterZip && closeAfterZip.checked) {
                console.log('close on zip');
                window.close();
            }
        };

        // fixing the download button text
        const dlBtn = document.querySelector('#downloadBtn');
        if (dlBtn) dlBtn.classList.add('genzip-possible');
        updateDownloadBtnText();

        const qualImgs = getQualifiedGImgs({
            exception4smallGifs: document.querySelector('#GIFsExceptionBox').checked
        });

        return zip.zipFiles(qualImgs);
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
                    console.debug('word ' + words1[i] + ' was found in both strings');
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
        const menuItems = document.querySelectorAll('.hdtb-mitem');
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
        menuItemsObj.selected = document.querySelector('.hdtb-mitem.hdtb-imb');

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


    unsafeWindow.gZipImages = gZipImages;
    unsafeWindow.zip = zip;
    unsafeWindow.ImagePanel = ImagePanel;
    unsafeWindow.IP = ImagePanel;
    unsafeWindow.successfulUrlsSet = ublSitesSet;
    // noinspection JSUnresolvedVariable
    unsafeWindow.ublSitesSet = ublSitesSet;
    unsafeWindow.ublMap = ublMap;

    unsafeWindow.GSaves = GSaves;

    unsafeWindow.getImgMetaById = getImgMetaById;

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


    // GDLPI script css
    addCss('a.x_source_link {' + [
        'line-height: 1.0',  // increment the number for a taller thumbnail info-bar
        'text-decoration: none !important',
        'color: inherit !important',
        'display: block !important'
    ].join(';') + '}');

    // give a white border so that we'll have them all the same size
    addCss('div.rg_bx { border-radius: 2px;border: 3px #fff solid;}');

    // language=CSS
    addCss(`img.${showImages.ClassNames.DISPLAY_ORIGINAL}[loaded="loading"],
        img.${showImages.ClassNames.DISPLAY_ORIGINAL}[loaded="error"] {
        border: 3px #F00 solid;
    }

    img.${showImages.ClassNames.DISPLAY_ORIGINAL}[loaded="loading"],
        img.${showImages.ClassNames.DISPLAY_ORIGINAL}[loaded="error"] {
        -webkit-filter: grayscale(1) !important; /* Webkit */
        opacity: 0.5 !important;
    }`);

    // language=CSS
    addCss(
        ` /*set borders*/
    div.${showImages.ClassNames.DISPLAY_ORIGINAL}:not(.irc_mimg):not(.irc_mutc) {
        border-radius: 5px;
        border: 3px #0F0 solid;
    }

    div.${showImages.ClassNames.FAILED_PROXY}:not(.irc_mimg):not(.irc_mutc) {
        border: 3px #FFA500 solid;
    }`);

    // language=CSS
    addCss(`.grey-scale,
    img[loaded="error"] {
        -webkit-filter: grayscale(1);
    }

    img[loaded="error"],
    img[loaded="loading"] {
        opacity: 0.5;
        filter: alpha(opacity=50); /* For IE8 and earlier */
        filter: opacity(50%);
    }

    img[loaded="true"] {
        opacity: 1;
        filter: alpha(opacity=100); /* For IE8 and earlier */
        filter: opacity(100%);
    }`);

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

/*takes care of the main image link, makes sure it's exactly the same size of the image */
div.irc_mic > a, a.irc_mutl, a.irc_mi, a.irc_mil {
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

/*for the imagebox info link*/
a.iKjWAf.irc-nic.isr-rtc.a-no-hover-decoration {
    padding: 2px 4px 0px 0px;
}

.ext-gif {
    background-color: #2c0330 !important;
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

/* sliders*/
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

.fixed-position${Preferences.page.staticNavbar ? ', #qbc, #rshdr:not(#sfcnt)' : ''} {
    position: fixed;
    top: 0;
    z-index: 1000;
}

.ubl-site {
    color: ${Preferences.loading.successColor} !important;
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
     *  do NOT just take the returned value and start adding elements.
     *  @return {Promise<(HTMLDivElement|HTMLElement)>} returns the parent navbar element
     */
    function createAndGetNavbar() {
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

        const $navbar = $('<div id="topnav"><div id="topnav-content"></div></div>');

        document.body.firstElementChild.before($navbar[0]);

        function adjustTopMargin() {
            document.body.style.top = document.querySelector('#topnav').offsetHeight.toString() + 'px';
        }

        window.addEventListener('resize', adjustTopMargin);
        // observe for elements being added, need to readjust topmargine
        observeDocument(adjustTopMargin, { baseNode: '#topnav' });

        document.body.style.position = 'relative';

        return elementReady('#topnav-content').then((topnavContent) => {
            adjustTopMargin();
            return topnavContent;
        });
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
    return elementReady('head').then(head => {
        head.appendChild(style);
        return style;
    });
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
    var data = new Blob([text], { type: 'text/plain' });
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


/**
 * @param {function} callback
 * @param {MutationObserverInit=} options
 * @param {number} [options.callbackMode=0] - 0: single callback per batch (pass `mutations`), 1: callback for each added node
 * @param {(Element|String)} [options.baseNode='body'] - 0: selector for the baseNode
 *
 * @param {string[]} [options.attributeFilter=[]] Optional
 * @param {boolean} [options.attributeOldValue=false] Optional
 * @param {boolean} [options.attributes=false] Optional
 * @param {boolean} [options.characterData=false] Optional
 * @param {boolean} [options.characterDataOldValue=false] Optional
 * @param {boolean} [options.childList=false] Optional
 * @param {boolean} [options.subtree=false] Optional
 *
 * @returns {MutationObserver}
 */
function observeDocument(callback, options = {}) {
    options = $.extend({
        callbackMode: 0, // 0: single callback per batch (pass `mutations`), 1: callback for each added node
        baseNode: 'body',

        attributeFilter: [],
        attributeOldValue: true,
        attributes: true,
        characterData: false,
        characterDataOldValue: false,
        childList: true,
        subtree: true,
    }, options);

    var observer = {};
    var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

    const baseNode = options.baseNode instanceof Element ? () => options.baseNode : options.baseNode;

    elementReady((mutationRecords) => $(baseNode).length !== 0 ? mutationRecords : null).then((mutationRecords) => {
        callback(mutationRecords);
        if (!MutationObserver) {
            document.addEventListener('DOMAttrModified', callback, false);
            document.addEventListener('DOMNodeInserted', callback, false);
        } else {
            observer = new MutationObserver(function (mutations, me) {
                observer.disconnect();

                switch (options.callbackMode) {
                    case 0:
                        callback(mutations, me);
                        break;
                    case 1:
                        for (const mutation of mutations) {
                            if (mutation.addedNodes.length) {
                                callback(mutation, me);
                            }
                        }
                        break;
                }
                observer.continue();
            });
            observer.continue = () => observer.observe(document.documentElement, options);

            observer.continue();

            return observer;

        }
    });
    return observer;
}

/**
 *
 * @param {(String|String[]|Function)} getter -
 *      string: selector to return a single element
 *      string[]: selector to return multiple elements (only the first selector will be taken)
 *      function: getter(mutationRecords|{})-> Element[]
 *          a getter function returning an array of elements (the return value will be directly passed back to the promise)
 *          the function will be passed the `mutationRecords`
 * @param {Number=0} timeout - timeout in milliseconds, how long to wait before throwing an error (default is 0, meaning no timeout (infinite))
 * @returns {Promise<Element|any>} the value passed will be a single element matching the selector, or whatever the function returned
 */
function elementReady(getter, timeout = 0) {
    return new Promise((resolve, reject) => {
        var returnMultipleElements = getter instanceof Array && getter.length === 1;
        var _timeout;
        var _getter = typeof getter === 'function' ?
            (mutationRecords) => {
                try {
                    return getter(mutationRecords) || [];
                } catch (e) {
                    return false;
                }
            } :
            () => returnMultipleElements ? document.querySelectorAll(getter[0]) : document.querySelector(getter)
            ;
        var computeResolveValue = function (mutationRecords) {
            // see if it already exists
            const ret = _getter(mutationRecords || {});
            if (ret && (!returnMultipleElements || ret.length)) {
                resolve(ret);
                clearTimeout(_timeout);

                return true;
            }
        };

        if (computeResolveValue(_getter())) {
            return;
        }

        if (timeout)
            _timeout = setTimeout(() => {
                const error = new Error(`elementReady(${getter}) timed out at ${timeout}ms`);
                reject(error);
                console.warn(error);
            }, timeout);


        new MutationObserver((mutationRecords, observer) => {
            var completed = computeResolveValue(_getter(mutationRecords));
            if (completed) {
                observer.disconnect();
            }
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
 * @param {ConstrainDOMString|string} html
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

function unsafeEval(func, ...arguments) {
    let body = 'return (' + func + ').apply(this, arguments)';
    unsafeWindow.Function(body).apply(unsafeWindow, arguments);
}

function enhanceLink(a) {
    // at this point, href= the gimg search page url
    /** stop propagation onclick */
    var purifyLink = function (a) {
        if (/\brwt\(/.test(a.getAttribute('onmousedown'))) {
            a.removeAttribute('onmousedown');
        }
        if (a.parentElement && /\bclick\b/.test(a.parentElement.getAttribute('jsaction') || '')) {
            a.addEventListener('click', function (e) {
                e.stopImmediatePropagation();
                e.stopPropagation();
            }, true);
        }
    };

    purifyLink(a);
    a.setAttribute('rel', 'noreferrer');
    a.setAttribute('referrerpolicy', 'no-referrer');
}


