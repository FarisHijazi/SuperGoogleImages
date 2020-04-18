// ==UserScript==
// @name         Super Google Images
// @namespace    https://github.com/FarisHijazi/SuperGoogle
// @author       Faris Hijazi
// @version      0.9
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
// @require      https://rawgit.com/notifyjs/notifyjs/master/dist/notify.js
// @require      https://github.com/FarisHijazi/ShowImages.js/raw/master/PProxy.js
// @require      https://github.com/FarisHijazi/GM_downloader/raw/master/GM_Downloader.user.js
// @require      https://github.com/FarisHijazi/ShowImages.js/raw/master/ShowImages.js
// @updateUrl    https://raw.githubusercontent.com/FarisHijazi/SuperGoogle/master/SuperGoogle.user.js
// @run-at       document-start
// @connect      *
// ==/UserScript==

// https://github.com/FarisHijazi/SuperGoogle/projects/1

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
const normalizeUrl = (function () {
    const fakeLink = document.createElement('a');
    return function (url) {
        fakeLink.href = url;
        return fakeLink.href;
    };
})();


// main
(function () {
    'use strict';

    // TODO: replace this with importing GM_dummy_functions, and importing a polyfill
    if (typeof unsafeWindow === 'undefined') unsafeWindow = window;
    unsafeWindow.unsafeWindow = unsafeWindow;

    // prevents duplicate instances
    if (typeof unsafeWindow.superGoogle !== 'undefined')
        return;

    const superGoogle = this || {};
    unsafeWindow.superGoogle = superGoogle;
    superGoogle.$ = $;

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

    function equivalentObjects(a, b) {
        if (a == null) {
            return b == null;
        } else if (b == null) {
            return false;
        }
        const aProps = Object.getOwnPropertyNames(a);
        const bProps = Object.getOwnPropertyNames(b);

        if (aProps.length !== bProps.length)// If number of properties is different, objects are not equivalent
            return false;

        for (const propName of aProps) // If values of same property are not equal, objects are not equivalent
            if (a[propName] !== b[propName])
                return false;
        return true;
    }

    //TODO: move this to UrlUtils
    /**
     * @return {Object} searchParams as an object
     */
    URL.prototype.__defineGetter__('sp', function () {
        return Object.fromEntries(this.searchParams.entries());
    });
    URL.prototype.equals = function (other, hashSensitive = false) {
        function equalUrls(url1, url2, hashSensitive = false) {
            return (
                equivalentObjects(url1.sp, url2.sp) && // equal search params
                (url1.hostname === url2.hostname) &&
                (!hashSensitive || url1.hash === url2.hash)
            );
        }

        return equalUrls(this, other, hashSensitive);
    };


    // === end of basic checks and imports ===


    const debug = true;
    const showImages = new ShowImages({
        loadMode: 'parallel',
        imagesFilter: (img, anchor) => {
            const conditions = [
                // !img.classList.contains(showImages.ClassNames.DISPLAY_ORIGINAL),
                // !img.closest('.' + this.ClassNames.DISPLAY_ORIGINAL),
                // /\.(jpg|jpeg|tiff|png|gif)($|[?&])/i.test(anchor.href),
                // !img.classList.contains('irc_mut'),
                !img.closest('div.irc_rismo'),
                !/^data:/.test(anchor.href),
            ];
            return conditions.reduce((a, b) => a && b);
        },
    });
    showImages.imageManager.loadTimeout = -1;

    console.log('SuperGoogle showImages:', showImages);
    superGoogle.showImages = showImages;

    const pageUrl = new URL(location.href);

    const mousetrap = Mousetrap();
    superGoogle.mousetrap = mousetrap;

    checkImports(['ProgressBar', '$', 'JSZip'], 'SuperGoogle.user.js', true);
    console.debug('SuperGoogle running');

    /**
     * @type {{
     *   GMValues: {hideFailedImagesOnLoad: string,},
     *   ClassNames: {
     *      buttons: string,
     *      belowDiv: string
     *   },
     *   Selectors: {
     *      Panel: {
     *         buttonDropdown: string,
     *         mainPanel: string,
     *         panels: string,
     *         focusedPanel: *,
     *         ptitle: string,
     *         panelExitButton: *
     *      },
     *      showAllSizes: string,
     *      selectedSearchMode: string,
     *      googleButtonsContainer: string,
     *      sideViewContainer: string,
     *      searchModeDiv: string,
     *      searchBox: string
     *   }
     *   }}
     */
    const Consts = {
        GMValues: {
            hideFailedImagesOnLoad: 'HIDE_FAILED_IMAGES_ON_LOAD'
        },
        Selectors: {

            imageLinks: 'a[jsname="sTFXNd"]', // includes related images
            /** The "All sizes" link from the SearchByImage page*/
            showAllSizes: '#jHnbRc > div.O1id0e > span:nth-child(2) > a',
            searchModeDiv: 'div#hdtb-msb-vis',
            selectedSearchMode: 'div#hdtb-msb-vis div.hdtb-msel',
            searchBox: 'input[type="text"][title="Search"]',
            googleButtonsContainer: '#hdtb-msb',
            menuItemsAndButtonsContainer: '#hdtb-msb, .tAcEof',
            sideViewContainer: '#irc_bg',
            /** the panel element containing the current image [data-ved], so if you observe this element, you can get pretty much get all the data you want.*/
            Panel: {
                //ok, there's a top part, and this top part has 3 panels (only one is shown at a time)
                // panelsContainer: '#Sva75c > div > div > div.pxAole'

                sidepanelScrollEl: '#irc-ss, #islsp',
                mainPanel: 'div#irc_cc, #islsp',
                panelExitButton: ['a#irc_cb', 'a#irc_ccbc'].join(),
                ptitle: 'div.irc_mmc.i8152 > div.i30053 > div > div.irc_it > span > a.irc_pt.irc_tas.irc-cms.i3598.irc_lth',
                buttonDropdown: 'div.irc_mmc.i8152 > div.i30053 > div > div.irc_m.i8164',
                focusedPanel: [
                    'div#irc_cc div.irc_c[style*="translate3d(0px, 0px, 0px)"]', // normal panel mode (old Google)
                    '#Sva75c > div > div > div.pxAole > div:not([style*="display: none;"])' // for side panel mode
                ].join(),
                panels: '#Sva75c > div > div > div.pxAole > div, #irc_cc div.irc_c',
            },
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
                autoLoadMoreImages: false, // somewhat problematic and can be annoying
                showImgHoverPeriod: 350, // if negative, then hovering functionality is disabled
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
            panels: {
                autoShowFullresRelatedImages: true,
                loopbackWhenCyclingRelatedImages: false,
                favoriteOnDownloads: true, // favorite any image that you download
                enableWheelNavigation: true,
                invertWheelRelativeImageNavigation: false,
            },
        };

        const o = $.extend(DEFAULTS, GM_getValue('Preferences'));

        o.store = () => GM_setValue('Preferences', o);
        o.get = () => GM_getValue('Preferences');


        // write back to storage (in case the storage was empty)
        o.store();

        return o;
    })();

    /** TODO: write jsdoc
     * @type {{
     *  elements: {
     *
     *  },
     *  url: {
     *      gImgSearchURL,
     *      reverseImageSearchUrl,
     *      getGImgReverseSearchURL: function,
     *      siteSearchUrl: function,
     *      isOnGoogle,
     *      isOnGoogleImages,
     *      isOnGoogleImagesPanel,
     *      isRightViewLayout
     *  }
     *  }}
     */
    const GoogleUtils = (function () {
        const isOnGoogle = () => GoogleUtils.elements.selectedSearchMode && GoogleUtils.elements.selectedSearchMode.innerHTML === 'Images';

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
            els.__defineGetter__(key, () => key.slice(-1).toLowerCase() === 's' ? // ends with 's'? (is plural?)
                document.querySelectorAll(v) : document.querySelector(v)
            );
        }

        const o = {
            /** @type{{
             * isOnGoogle,
             * isOnGoogleImages,
             * isOnGoogleImagesPanel,
             * isRightViewLayout,
             * }}
             */
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
        o.__defineGetter__('isRightViewLayout', () => { // check if the Google images layout
                return !!document.querySelector('#irc_bg.irc-unt, #Sva75c');
            }
        );

        return o;
    })();
    // unsafeWindow.GoogleUtils = GoogleUtils;

    /**
     * the zip file
     * @type {JSZip}
     */
    let zip = new JSZip();
    zip.name = (document.title).replace(/site:|( - Google Search)/gi, '');

    let shouldShowOriginals = false;
    let currentDownloadCount = 0;
    let isTryingToClickLastRelImg = false;

    const directLinkReplacer = googleDirectLinksInit();
    unsafeWindow.directLinkReplacer = directLinkReplacer;

    document.cursor = {
        pageX: 0,
        pageY: 0,
        clientX: 0,
        clientY: 0,
    };
    document.addEventListener('mousemove', function (e) {
        document.cursor.pageX = e.pageX;
        document.cursor.pageY = e.pageY;
        document.cursor.clientX = e.clientX;
        document.cursor.clientY = e.clientY;
    });

    /*
     * change mouse cursor when hovering over elements for scroll navigation
     * cursor found here:   https://www.flaticon.com/free-icon/arrows_95103#
     */

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
                for (const key of Object.keys(this)) {
                    console.debug('extending panel, adding:', key, element);
                    element[key] = this[key];
                }

                ImagePanel.thePanels.add(element.panel);
            }

            // try {
            this.__modifyPanelEl();
            // } catch (e) {
            //     console.error(e);
            // }
        }
        /** The big panel that holds all 3 child panels
         * @return {HTMLDivElement|Node} */
        static get mainPanelEl() {
            return document.querySelector(Consts.Selectors.Panel.mainPanel);
        }
        /** @return {ImagePanel} returns the panel that is currently in focus (there are 3 panels) */
        static get focP() {
            return ImagePanel.mainPanelEl.querySelector(Consts.Selectors.Panel.focusedPanel).panel;
        }
        static get noPanelWasOpened() {
            return document.querySelector(Consts.Selectors.Panel.panelExitButton).getAttribute('data-ved') == null;
        }
        static get isPanelCurrentlyOpen() {
            const irc_bg = document.querySelector('#irc_bg');
            return ImagePanel.focP.mainImage && irc_bg.style.display !== 'none' && irc_bg.getAttribute('aria-hidden') !== 'true';
        }
        /**
         @return {Meta}
         */
        get imageData() {
            return getMeta(this.mainImage);
        }
        get isFocused() {
            return this.el.style.display !== 'none' || this.el.style.transform === 'translate3d(0px, 0px, 0px);';
        }
        get panel() {
            return this;
        }
        /** @return {HTMLDivElement} div.irc_it */
        get titleAndDescriptionDiv() {
            if (!this.el) {
                return;
            }
            const titleAndDescrDiv = this.q('div.irc_mmc div.irc_it, div.OUZ5W > div.QnfS4e');
            if (!titleAndDescrDiv) {
                console.warn('TitleAndDescription div not found!');
            }
            return titleAndDescrDiv;
        }
        /** @return {HTMLSpanElement|null} */
        get descriptionEl() {
            const titleDescrDiv = this.titleAndDescriptionDiv;
            if (titleDescrDiv) {
                return titleDescrDiv.querySelector('div.irc_asc span.irc_su, .YRasv.mkSNZe');
            } else {
                console.warn('titleAndDescriptionDiv not found for image panel:', this.el);
            }
        }
        get descriptionText() {
            const descr = this.descriptionEl;
            const descriptionText = descr ? descr.innerText : '';

            return cleanGibberish((descriptionText.length < 2) ? this.pTitle_Text : descriptionText);
        }
        /** @return {HTMLAnchorElement} */
        get pTitle_Anchor() {
            return this.titleAndDescriptionDiv.querySelector('a.irc_pt, a.Beeb4e');
        }
        get pTitle_Text() {
            if (!this.pTitle_Anchor) {
                console.warn('Title anchor not found!');
                return '';
            }
            return cleanGibberish(this.pTitle_Anchor.innerText.replace(getHostname(this.pTitle_Anchor.href), ''));
        }
        /** Secondary title
         * @return {HTMLAnchorElement, Node} */
        get sTitle_Anchor() {
            return this.q('a.irc_lth.irc_hol, div:nth-child(1) > div > a.ZsbmCf');
        }
        get sTitle_Text() {
            const secondaryTitle = this.sTitle_Anchor;
            const siteHostName = getHostname(this.sTitle_Anchor.href);
            return cleanGibberish(secondaryTitle.innerText.replace(siteHostName, ''));
        }
        get imgUrl() {
            return this.mainImage.src;
        }
        get ris_fc_Url() {
            return this.ris_fc_Div ? this.ris_fc_Div.querySelector('a').href : normalizeUrl('#');
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
            let c = this.ris_Divs;
            c = c && Array.from(c);
            return c && c.pop();
        }
        /** @return {HTMLDivElement[]} returns all related image divs (including the "VIEW MORE" div)*/
        get ris_DivsAll() {
            const c = this.ris_Container;
            if (c) return Array.from(c.querySelectorAll('div[jsaction] [jsname="neVct"] > div > div'));
        }
        /** @return {HTMLDivElement[]} returns only related image divs (excluding the "VIEW MORE" div)*/
        get ris_Divs() {
            const d = this.ris_DivsAll;
            if (d) return d.filter(div => !div.classList.contains('irc_rismo'));
            return [];
        }
        /** @return {HTMLDivElement} returns related image container (div.irc-deck)*/
        get ris_Container() {
            return Array.from(this.qa('div.irc_ris > div > div.irc_rit.irc-deck.irc_rit, [jsname="neVct"]')).pop();
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
            const buttonsContainer = this.q(['.irc_but_r > tbody > tr', '.ZUo4Ze'].join());
            const buttons = this.qa('.irc_but_r > tbody > tr a:first-child, [role="button"]');
            if (!buttons || !buttonsContainer) return {};

            buttons.Visit = this.q(['a.i3599.irc_lth', '.i3724.irc_lth'].join());
            buttons.Save = this.q('a.i15087');
            buttons.ViewSaved = this.q(['a.i18192.r-iXoO2jjyyEGY', 'a.irc_vsl.i18192'].join());
            buttons.Share = this.q('a.i17628');

            const notsaved = this.q('a.i15087'); // the button that appears without a star (not saved)
            const saved = this.q('a.i35661'); // has a star (means it's saved)

            buttons.save = function () {
                if (saved && saved.style.display === 'none') // if not saved, save
                    if (buttons.saved) buttons.saved.click();
            };
            buttons.unsave = function () {
                if (notsaved && notsaved.style.display === 'none') // if saved, unsave
                    if (buttons.notsaved) buttons.notsaved.click();
            };

            return buttons;
        }
        /** @return {HTMLImageElement }
         * img.irc_mi is the actual main image, , img.irc_mut is the loader image (the thumbnail when it didn't load yet)*/
        get mainImage() {
            if (this.el) {
                return this.q('a.irc_mil img.irc_mi, a[role="link"] img');
            }
        }
        get mainThumbnail() {
            if (this.el) {
                return this.q('a.irc_mutl img.irc_mut, a[role="link"] img');
            }
        }

        //get imageUrl() {return this.mainImage.src;}
        get bestNameFromTitle() {
            const sTitle = this.sTitle_Text;
            const pTitle = this.pTitle_Text;
            const description = this.descriptionText;
            const unionPTitleAndDescrAndSTitle = unionTitleAndDescr(description, unionTitleAndDescr(pTitle, sTitle));

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
            return this.q('.irc_t, div.zjoqD');
        }
        get rightPart() {
            return this.q('.irc_mmc, div.QnfS4e');
        }
        /**
         * Search-By-Image URL
         * if it does return something, then it will NOT continue to adding the new element.
         * @return {*}
         */
        get sbiUrl() {
            const sbiUrl = new URL(GoogleUtils.url.getGImgReverseSearchURL(this.imgUrl || this.mainThumbnail.src));
            sbiUrl.searchParams.append('allsizes', '1');
            return sbiUrl.toString();
        }
        /**
         * waits for the first panel to be in focus, then binds mutation observers to panels firing "panelMutation" events
         * Also applies modifications to panels (by calling modifyP)
         * @returns {Promise}
         */
        static init() {
            // wait for panel to appear then start modding
            return elementReady('div.QnfS4e [jsname="neVct"]').then(function () {
                // bind clicking the image panel 'X' button remove the hash from the address bar
                // there exists only a single X button common for all 3 image panels
                $(Consts.Selectors.Panel.panelExitButton).click(removeHash);

                // instantiate the panels and (which call modPanel() and updatePanel(), which do the modifying)
                $(Consts.Selectors.Panel.panels).toArray()
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
            const previousImageArrow = document.querySelector('a[jsaction="irc.arb"], div[id^="irc-la"] > a');
            const x = previousImageArrow && previousImageArrow.style.display !== 'none' ? // is it there?
                !previousImageArrow.click() : // returns true
                false;
            if (!x) console.log('prev arrow doesn\'t exist');
            return previousImageArrow;
        }
        /**Goes to the next (Right) main mainImage*/
        static nextImage() {
            const nextImageArrow = document.querySelector('a[jsaction="irc.arf"], div[id^="irc-ra"] > a');
            const x = nextImageArrow && nextImageArrow.style.display !== 'none' ? // is it there?
                !nextImageArrow.click() : // returns true
                false;
            if (!x) if (debug) console.log('next arrow doesn\'t exist');
            return nextImageArrow;
        }
        /**
         * FIXME: doesn't really work
         * fetches and goes to the page for the current image (similar to image search but just 'more sizes of the same image')
         */
        static moreSizes() {
            const panel = this.focP;
            const reverseImgSearchUrl = GoogleUtils.url.getGImgReverseSearchURL(panel.imgUrl);

            const fetchUsingProxy = (url, callback) => {
                const proxyurl = 'https://cors-anywhere.herokuapp.com/';
                callback = callback || (contents => console.log(contents));
                return fetch(proxyurl + url) // https://cors-anywhere.herokuapp.com/https://example.com
                    .then(response => response.text())
                    .then(callback)
                    .catch(() => console.error(`Can’t access ${url} response. Blocked by browser?`));
            };
            let z = open().document;
            return fetchUsingProxy(reverseImgSearchUrl, function (content) {
                console.log('content:', content);
                let doc = document.createElement('html');
                doc.innerHTML = content;
                const allSizesAnchor = doc.querySelector(Consts.Selectors.showAllSizes);
                if (allSizesAnchor && allSizesAnchor.href) {
                    return fetchUsingProxy(allSizesAnchor.href, function (content2) {
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
            const dir = 'Google_related ' + document.title.replace(/google|com/gi, '');
            const relatedImageDivs = ImagePanel.focP.ris_DivsAll;
            console.log('download related images:', relatedImageDivs);

            //         var metaDataStr = `Google images data for related images
            // Title:     ${document.title}
            // URL:     ${location.href}
            // Search:    ${q('#lst-ib').value}`;

            const relatedImageDownloads = Array.from(relatedImageDivs).map(imgDiv => {
                const img = imgDiv.querySelector('img');
                const meta = getMeta(img);
                let imgTitle = '';

                imgTitle = meta.pt;
                const href = imgDiv.querySelector('a[href]').href;

                return {
                    url: href,
                    name: imgTitle,
                    directory: dir,
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
                const currentImageURL = panel.imgUrl;
                console.log('downloadCurrentImage:', name, currentImageURL);
                download(currentImageURL, name, panel.mainImage);
                panel.q('.torrent-link').click();

                if (Preferences.panels.favoriteOnDownloads) {
                    panel.buttons.save();
                }
            } catch (e) {
                console.warn(e);
            }
        }
        static showRis() {
            if (ImagePanel.thePanels)
                return Array.from(ImagePanel.thePanels).map(p => p.showRis());
        }
        static prevRelImg() {
            ImagePanel.focP.prevRelImg();
        }
        static nextRelImg() {
            ImagePanel.focP.nextRelImg();
        }
        /**
         * keeps on trying to press the bottom related image (the last one to the bottom right) until it does.
         * @param interval  the interval between clicks
         */
        static __tryToClickBottom_ris_image(interval = 30) {
            if (GoogleUtils.isRightViewLayout) {
                return;
            }
            isTryingToClickLastRelImg = true; // set global flag to true (this is to prevent the scroll handler from ruining this)

            let timeout = null;
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
                console.log('waiting to be done ClickLastRelImg...');
            }
        }

        /** Should be called only once for each panel */
        __modifyPanelEl() {
            const panel = this;
            if (panel.el.classList.contains('modified-panel')) {
                console.warn('panel already modified, do not try to modify it again');
                return panel;
            }

            if (debug) console.debug('Modifying panelEl:', panel.el);

            panel.el.addEventListener('panelMutation', () => panel.onPanelMutation());
            panel.onPanelMutation();
            panel.el.classList.add('modified-panel');

            if (panel.rightPart) panel.rightPart.classList.add('scroll-nav');

            // add onerror listener to the mainimage
            // this.mainImage.addEventListener('error', function(e) { console.log('OOPSIE WOOPSIE!! Uwu We made a fucky wucky!! A wittle fucko boingo! The code monkeys at our headquarters are working VEWY HAWD to fix this!', e); });


            // adding text-decoration to secondary title
            $(panel.sTitle_Anchor).parent()
                .after('<div class="' + Consts.ClassNames.belowDiv + ' _r3" style="padding-right: 5px; text-decoration:none;"/>');

            // make the buttons container take more space so the buttons can be bigger
            if (panel.q('.eg084e.ZUo4Ze')) panel.q('.eg084e.ZUo4Ze').style.display = 'inline-flex';

            // adding the "search by title" link
            {
                const titleSearch = createElement(
                    '<div style="font-size: smaller; padding: 10px; display: inline-block;">' +
                    '(<a class="search-by-title" href="#">more from this title</a>)' +
                    '</div>'
                );
                const titleSearchLink = titleSearch.querySelector('a');
                titleSearchLink.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    window.open(GoogleUtils.url.gImgSearchURL + encodeURIComponent(panel.pTitle_Text));
                });
                panel.pTitle_Anchor.after(titleSearch);
            }

            panel.inject_SiteSearch();

            panel.inject_ViewImage();
            panel.inject_DownloadImage();

            panel.inject_sbi();

            panel.inject_Download_ris();
            panel.inject_ImageHost();

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
                for (const copyrightEl of panel.el.querySelectorAll('.irc_ft')) {
                    copyrightEl.remove();
                }
            })();

            // injecting rarbg torrent link button
            (function injectRarbgButton() {
                const rarbg_tl = createElement(`<a class="_r3 hover-click o5rIVb torrent-link"
   style=" float: left; padding: 4px; display: none; font-size: 10px; color: white;">
    <img src="https://dyncdn.me/static/20/img/16x16/download.png" alt="Rarbg torrent link" style=" width: 25px; height: 25px; display: inherit;">
    <label>Torrent link</label></a>`);
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
            if (Preferences.panels.enableWheelNavigation && !GoogleUtils.isRightViewLayout) {
                // binding scroll handler (navigating between related images using mousewheel)
                panel.el.addEventListener('wheel', function (wheelEvent) {
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
                });

            }

            // add space between buttons, rather than stitle flexing and taking up all the space
            {
                const sTitleAnchor = this.sTitle_Anchor;
                sTitleAnchor.after(createElement('<div class="" tabindex="0" referrerpolicy="no-referrer" style="padding-right: 5px;text-decoration: none;display: inline-block;flex-grow: 1;"></div>'));
                sTitleAnchor.style.display = 'contents';
            }

            /** TODO: find a library to do this instead, with tooltips as well */
            function underliningBinded() {
                // Underlining binded keys
                const keymap = new Map([ // Key: selector, Value: character
                    ['.i15087', 's'],
                    ['.i18192', 'v']
                ]);
                for (const [selector, char] of keymap) {
                    const bindEl = document.querySelector(selector);
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

            //

            // const mainImage = panel.mainImage;
            // mainImage.updateLink = function () {
            //     const anchor = this.closest('a');
            //     anchor.href = this.src;
            //     console.log('panel.mainImage.src updating link:', anchor);
            // };
            // mainImage.__setAttribute = mainImage.setAttribute; // HACK: making a copy
            // mainImage.setAttribute = (attr, val) => {
            //     if (attr !== 'src') {
            //         mainImage.__setAttribute(attr, val);
            //     } else {
            //         mainImage.__setAttribute(attr, val);
            //         mainImage.updateLink();
            //     }
            // }; // overriding setAttribute
            // mainImage.__defineSetter__('src', function (val) {
            //     mainImage.__setAttribute('src', val);
            //     mainImage.updateLink();
            // });

            return panel;
        }
        /**
         * Called once every time the panel is changed
         * @return {boolean}
         */
        __update() {
            let panel = this;
            // panel.removeLink();

            //TODO: maybe this is what's preventing the main image from changing even when the ris loads

            // make sure that main image link points to the main image (and not to the website)
            const imgAnchor = panel.q('a[role="link"]');
            imgAnchor.href = imgAnchor.querySelector('img').getAttribute('src') || '#';
            imgAnchor.addEventListener('click', function (e) {
                window.open(this.querySelector('img').getAttribute('src'), '_blank');
                e.stopImmediatePropagation();
                e.stopPropagation();
                e.preventDefault();
            });


            panel.linkifyDescription();
            panel.addImageAttributes();
            panel.inject_Download_ris();
            panel.update_SiteSearch();
            panel.update_ViewImage();
            panel.update_ImageHost();
            panel.update_sbi();

            // the focused ris img
            // const img_ris = panel.ris_fc_Div.querySelector('img');
            // const tu = getMeta(img_ris).tu; //thumbnail url
            // if (tu) panel.mainThumbnail.src = tu;
            // if (img_ris.getAttribute('loaded') === 'error') {
            //     if (tu) panel.mainImage.src = tu;
            // }


            // update sTitle href to point to the panel page
            // FIXME: don't point to the focpDiv, get the current image meta instead
            // panel.sTitle_Anchor.href = getPanelPage(getMeta(panel));


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
        // TODO: maybe return the promises
        showRis() {
            for (const div of this.ris_Divs) {
                // if (debug) console.debug('showRis -> showImages.replaceImgSrc', div.querySelector('img'));
                const img = div.querySelector('img');
                const forceUpdateOnload = false;
                showImages.replaceImgSrc(img).then(e => { // DEBUG: this is still in testing (it causes issues with the rightView layout)
                    if (forceUpdateOnload && isLoaded(img) && div.matches('.irc_rist')) { // if is the focused ris
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
                }).catch(err => {
                    console.warn('showRis failed', this.mainImage, img, err);
                });
            }
        }
        linkifyDescription() {
            const self = this;
            const descriptionEl = self.descriptionEl;

            if (!descriptionEl) {
                console.warn('linkifyDescription(): descriptionEl is not defined');
                return;
            }


            let descriptionAnchor = self.titleAndDescriptionDiv.querySelector('div.irc_asc > a.clickable-descr');
            if (!descriptionAnchor) {
                descriptionAnchor = $(descriptionEl.outerHTML.replace('<span', '<a').replace('</span', '</a'))
                    .text(descriptionEl.innerText);

                $(descriptionEl)
                    .before(descriptionAnchor)
                    .css({display: 'none'});
            }

            $(descriptionAnchor)
                .addClass('clickable-descr')
                .attr({
                    href: GoogleUtils.url.gImgSearchURL + encodeURIComponent(cleanSymbols(descriptionAnchor.innerText)),
                    target: '_blank'
                });
        }
        inject_Download_ris() { // download related images button
            const panel = this;
            // const risContainer = this.relatedImage_Container.parentNode;
            // this is the "related images" text
            const targetEl = panel.q('.irc_msc > div > div.yJbeqd:nth-child(1) > span, div.irc_ris > div > div.yJbeqd:nth-child(1) > span');
            if (!targetEl) {
                return;
            }
            const className = 'download-related hover-click';
            const text = '[↓]&nbsp;Download&nbsp;Related';

            let dl_button = panel.q('.download-related');
            if (!dl_button) {
                dl_button = createElement(`<a class="${className}" role="button" style="padding: 5px; text-decoration:none;"><span>${text}</span></a>`);
                dl_button.addEventListener('click', function (element) {
                    ImagePanel.download_ris(element);
                    return false;
                });

            }
            targetEl.after(dl_button);

            { // inject_Show_ris
                const className = 'show-ris hover-click';
                const text = 'Show&nbsp;originals';

                let show_button = panel.q('.show-ris');
                if (!show_button) {
                    show_button = createElement(`<a class="${className}" role="button" style="padding: 5px; text-decoration:none;"><span>${text}</span></a>`);
                    show_button.addEventListener('click', function (e) {
                        ImagePanel.showRis();
                        return false;
                    });

                }
                dl_button.before(show_button);
            }

        }

        inject_DownloadImage() {
            const text = 'Download&nbsp;↓';
            if (this.sTitle_Anchor) {
                const dataVed = '';
                const className = 'download-image';

                const buttonHtml = `<td><a class="${className}" role="button" jsaction data-rtid jsl tabindex="0" data-ved="${dataVed}"><span>${text}</span></a></td>`;
                return this.addElementAfterSTitle(
                    buttonHtml,
                    '',
                    ImagePanel.downloadCurrentImage,
                    'LEFT',
                    'div'
                );
            }
        }
        /** Inject the SearchByImage anchor
         * @return {Node} */
        inject_sbi() {
            const href = '#'; //GoogleUtils.url.getGImgReverseSearchURL(this.imageUrl);
            const dataVed = ''; //()=>this.sTitleAnchor.getAttribute('data-ved'); // classes:    _ZR irc_hol i3724 irc_lth
            const className = 'search-by-image';
            const html = `<a class="o5rIVb ${className}" target="${Preferences.page.defaultAnchorTarget}" href="${href}" data-ved="${dataVed}" rel="noreferrer" data-noload="" referrerpolicy="no-referrer" tabindex="0" data-ctbtn="2"<span dir="ltr" style="text-align: left;float: right;">Search&nbsp;by&nbsp;image</span></a>`;

            const clickListener = function (e) {
                localStorage.setItem('clickShowAllSizes', "true");
            };
            return this.addElementAfterSTitle(html, className, clickListener, 'BOTTOM');
        }
        update_sbi() {
            // updating ImageHost
            const sbi = this.q('a.search-by-image'); //FIXME: this is null
            if (sbi) {
                sbi.href = this.sbiUrl;
            } else {
                console.warn('SearchByImage element not found:', sbi);
            }
        }

        inject_ViewImage() {
            const text = 'View&nbsp;image';
            const panel = this;

            if (panel.sTitle_Anchor) {
                const dataVed = '';
                const className = 'view-image';

                const link = panel.addElementAfterSTitle(
                    `<td><a href="" target="_blank" class="${className}" role="button" jsaction="" data-rtid="" jsl="" tabindex="0" data-ved="${dataVed}"> <span>${text}</span></a></td>`,
                    '',
                    null,
                    'LEFT',
                    'div'
                );

                $(link).on('mouseover click', function (e) {
                    panel.update_ViewImage();
                });

                const globeIcon = document.querySelector('._RKw._wtf._Ptf, .RL3J9c.Cws1Yc.wmCrUb');
                if (globeIcon) link.firstElementChild.before(globeIcon.cloneNode(true));

                return link;
            }
        }
        update_ViewImage() {
            const viewImage = this.q('.view-image'); // FIXME: this is null
            if (viewImage) {
                viewImage.href = this.imgUrl;
            } else {
                console.warn('viewImage element not found');
            }
        }

        inject_ImageHost() {
            const panel = this;
            let sibling = panel.q('[data-navigation="server"], .irc_msc, .irc_ris, [jsname="neVct"]');

            if (panel.sTitle_Anchor && sibling) {
                // const summaryTable = panel.element.querySelector('table[summary]._FKw.irc_but_r');
                const className = 'image-host hover-click';
                const element = createElement(`<a class="${className}" href="" target="${Preferences.page.defaultAnchorTarget}" rel="noreferrer" data-noload="" referrerpolicy="no-referrer" tabindex="0"  data-ved="" data-ctbtn="2" 
style="display: none; margin: 5px; padding: 5px; text-decoration:none;"
<span class="irc_ho" dir="ltr" style="text-align: center;">Image&nbsp;Host</span></a>`);
                sibling.before(element);
                panel.update_ImageHost();
                return element;
            }
        }
        update_ImageHost() {
            const self = this;
            elementReady(() => self.ris_fc_Div(), {timeout: 2000}).then(focusedImageDiv => {
                const url = focusedImageDiv.querySelector('a').href;
                const hostname = getHostname(PProxy.DDG.test(url) ? PProxy.DDG.reverse(url) : url);
                // updating ImageHost
                const ih = self.q('a.image-host');
                if (ih) {
                    ih.innerText = hostname;
                    ih.style.display = '';
                    ih.href = GoogleUtils.url.siteSearchUrl(hostname);
                }
            }).catch((e) => console.warn('ImageHost element not found', e));
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
            const containerEl = this.addElementAfterSTitle(
                `<a class="${spanClass} _r3 hover-click" target="${Preferences.page.defaultAnchorTarget}" rel="noreferrer" data-noload="" referrerpolicy="no-referrer" tabindex="0" href="${href}" data-ved="${dataVed}" data-ctbtn="2"<span class="irc_ho" dir="ltr" style="text-align: left;font-size: 12px;" >Site: ${hostname}</span></a>`,
                '',
                null,
                'BOTTOM',
                'div'
            );

            this.titleAndDescriptionDiv.after(containerEl);

            return containerEl;
        }

        update_SiteSearch() {
            const self = this;
            elementReady(() => self.q('a.site-search'), {timeout: 2000}).then(siteSearchAnchor => {
                const hostname = getHostname(this.sTitle_Anchor.href);
                siteSearchAnchor.innerText = 'site:' + hostname;
                siteSearchAnchor.href = (GoogleUtils.url.siteSearchUrl(hostname));

            })
                .catch(() => console.warn('Site Search element not found'))
        }
        /** Removes the annoying image link when the panel is open */
        removeLink() {
            const image = this.mainImage;
            const anchor = image.parentNode;
            anchor.href = null;
            console.log('anchor.href', anchor.href);
        }
        addImageAttributes() {
            const self = this;
            return elementReady(() => this.mainImage, {timeout: 2000}).then(mainImage => {
                mainImage.setAttribute('img-title', self.pTitle_Text);
                mainImage.setAttribute('description', self.descriptionText);
                mainImage.setAttribute('img-subtitle', self.sTitle_Text);
                mainImage.setAttribute('download-name', self.sTitle_Text);
                mainImage.setAttribute('alt', self.sTitle_Text);
            }).catch(e => console.warn('mainImage timed out', e))
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
        addElementAfterSTitle(html, containerClassName, clickListener, position = 'BOTTOM', parentTagName = 'div') {
            // TODO: use jQuery here

            const $element = $(html).addClass('o5rIVb');
            const containerEl = $(`<${parentTagName} class="_r3 NDcgDe ${containerClassName}"/>`)
                .css({
                    'padding-right': '5px',
                    'text-decoration': 'none',
                })
                .append($element)[0];
            const element = $element[0];

            const sTitle = this.sTitle_Anchor;
            switch (position) {
                case 'BOTTOM': {
                    // check if the below-st-div exists, create if it doesn't, then appendChild
                    let belowDiv = sTitle.parentElement.parentElement.querySelector(`.${Consts.ClassNames.belowDiv}`);
                    belowDiv.after(containerEl);
                    break;
                }
                case 'LEFT': {
                    sTitle.before(containerEl);
                    break;
                }
                case 'RIGHT': {
                    sTitle.parentNode.appendChild(containerEl);
                    break;
                }
                case 'NONE': {
                    break;
                }
                default: {
                    console.warn('Invalid position passed:', position);
                }
            }

            if (typeof (clickListener) === 'function') {
                element.addEventListener('click', function (e) {
                    clickListener(e);
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
                    const prevArrow = ImagePanel.previousImage();
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
            // if (debug) console.log('panelMutation()');
            // reAdjustAfterScrollEdge();

            this.__update();

            // this.mainImage.src = this.ris_fc_Url; // set image src to be the same as the ris

            if (Preferences.panels.autoShowFullresRelatedImages || shouldShowOriginals) {
                this.showRis();
            }

            (function updateSliderLimits() {
                // TODO: optimization: have a global `metaDatas` object that gets updated when new images are loaded, this prevents unneeded excessive calls
                //       OR: use the already binded meta objects with the images
                const metaDatas = Array.from(getImgBoxes()).map(getMeta);
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

            const mainImage = this.mainImage;
            if (mainImage && mainImage.src) {
                mainImage.closest('a').href = mainImage.src;
                showImages.replaceImgSrc(mainImage).then(function (event) {
                    console.warn(
                        'replaced main image:',
                        '\nthis=', this,
                        '\nevent=', event
                    );
                });
            } else {
                console.warn('Warning, mainImg.src undefined????!!', mainImage && mainImage.src, mainImage);
            }

            for (const ris_img of this.ris_Divs) {
                enhanceImageBox(ris_img);
            }
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

    elementReady('body').then(onload);

    // click showAllSizes link when it appears
    if (localStorage.getItem('clickShowAllSizes') === "true") {
        elementReady(Consts.Selectors.showAllSizes).then(function (el) {
            localStorage.setItem('clickShowAllSizes', "");
            return el.click();
        });
    }

    // === start of function definitions ===

    // called as soon as the "body" is loaded
    function onload() {
        if (GoogleUtils.isOnGoogleImages || GoogleUtils.isOnGoogleImagesPanel) {
            createStyles();
            bindKeys();

            ImagePanel.init();

            // wait for searchbar to load
            // document.addEventListener('DOMContentLoaded', onContentLoaded);
            elementReady(Consts.Selectors.menuItemsAndButtonsContainer).then(onSearchbarLoaded);

            // onImageBatchLoaded observe new image boxes that load
            observeDocument((mutations, me) => {
                if (!!document.querySelector("#islmp > div > div > div > div")) {
                    updateImageMetas();
                }
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

            // bind each result to the corresponding number
            for (let i = 0, results = document.querySelectorAll('div.srg > div'); i < results.length; i++) {
                mousetrap.bind(String(i + 1), function (e) {
                    results[i].querySelector('a').click();
                });
                results[i].before(createElement(`<strong style="float: left;">${i + 1}</strong>`));
            }
        }
    }

    // called when the searchbar is loaded (used for functionality that needs elements to be loaded)
    function onSearchbarLoaded() {
        // binding first letter of each menuItem ([A]ll, [I]mages, [V]ideos, ...)
        const menuItems = getMenuItems();
        for (const item of Object.keys(menuItems)) {
            const callback = function (e) {
                const elChild = menuItems[item].firstElementChild;
                if (elChild) elChild.click();
            };
            callback._name = 'Go to [' + item + '] tab';
            mousetrap.bind([`shift+${item.charAt(0).toLowerCase()}`], callback);
        }

        //
        // handling safe search and location operations here
        //
        const ssLink = document.querySelector('#ss-bimodal-strict');
        const ussLink = document.querySelector('#ss-bimodal-default');
        const safeSearchListener = function (e) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();

            toggle_safesearch();
        };
        if (ssLink) ssLink.addEventListener('click', safeSearchListener, true);
        if (ussLink) ussLink.addEventListener('click', safeSearchListener, true);
        // force safe search if already attempted and shouldBeUnsafesearch
        if (ussLink && localStorage.getItem('shouldBeUnsafesearch') === "true") {
            console.info('"shouldBeUnsafesearch"=true, but this is not unsafe search, forcing unsafe search using "ipv4"...');
            location.assign(unsafeSearchUrl()); // force unsafesearch
            localStorage.setItem('shouldBeUnsafesearch', "");
            return;
        }
        const targetHostname = localStorage.getItem('targetHostname');
        if (targetHostname && (targetHostname !== location.hostname)) {
            localStorage.setItem('targetHostname', '');
            location.hostname = targetHostname;
            return;
        }


        injectGoogleButtons().then(navbarContentDiv => {
            // code here...
        });

    }

    // ============

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
            105: 'numpad9',
            107: 'numpad+',
            109: 'numpad-',
        });

        // toggle forcedHostname
        mousetrap.bind('f h', function toggle_forcedHostname(e) {
            const wasForced = Preferences.location.forcedHostname.charAt(0) !== '!';
            const toForced = !wasForced && pageUrl.hostname !== Preferences.location.forcedHostname;

            console.log('"f h" [toggle forcedHostname]\nto:', toForced ? 'forced' : 'www.');

            if (toForced) {
                Preferences.location.forcedHostname = Preferences.location.forcedHostname.replace(/^!/, '');
            } else {
                Preferences.location.forcedHostname = '!' + Preferences.location.forcedHostname;
                pageUrl.hostname = 'www.google.com';
            }

            Preferences.store();
            const reload = !processLocation();

            if (reload) {
                console.log('location didn\'t change');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        });

        // S S: SafeSearch toggle
        mousetrap.bind('s s', toggle_safesearch);

        mousetrap.bind(['c c'], cleanupSearch);
        // to https://yandex.com/images/search?text=
        mousetrap.bind('y d x', function switchEngineToYandex() {
            const x = 'https://yandex.com/images/search?text=' + encodeURIComponent(new URL(location.href).searchParams.get('q'));
            console.log('Yandex url = ', x);
            location.assign(x);
        });

        mousetrap.bind(['alt+a'], function switchToAnimatedResults() {
            (!document.querySelector('#itp_animated').firstElementChild ? document.querySelector('#itp_').firstElementChild : document.querySelector('#itp_animated').firstElementChild).click();
        });
        mousetrap.bind(['D'], function downloadAll() {
            document.querySelector('#downloadBtn').click();
        });
        mousetrap.bind(['h'], function toggle_hideFailedImages() {
            document.querySelector('#hideFailedImagesBox').click();
        });
        mousetrap.bind(['g'], function toggle_gifsOnlyCheckbox() {
            document.querySelector('#GIFsOnlyBox').click();
        });
        mousetrap.bind(['esc', 'escape'], removeHash);

        mousetrap.bind(['/'], function focusSearchbar(e) { // focus search box
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
        //     mousetrap.bind(i.toString(), function (e) {
        //         ImagePanel.focP && ImagePanel.focP.buttons && i <= ImagePanel.focP.buttons.length && ImagePanel.focP.buttons[i - 1].click();
        //     });
        // }

        mousetrap.bind(['ctrl+['], siteSearch_TrimLeft);
        mousetrap.bind(['ctrl+]'], siteSearch_TrimRight);

        mousetrap.bind(['['], function stepDown_minImgSizeSlider(e) {
            Components.minImgSizeSlider.stepDown();
        });
        mousetrap.bind([']'], function stepUp_minImgSizeSlider(e) {
            Components.minImgSizeSlider.stepUp();
        });


        mousetrap.bind([`'`], function toggle_enableLoopRelatedImages(e) {
            Preferences.panels.loopbackWhenCyclingRelatedImages = !Preferences.panels.loopbackWhenCyclingRelatedImages;
            GM_setValue('LOOP_RELATED_IMAGES', Preferences.panels.loopbackWhenCyclingRelatedImages);
            console.log('LOOP_RELATED_IMAGES toggled to:', Preferences.panels.loopbackWhenCyclingRelatedImages);
        });
        mousetrap.bind(['c'], function goToCollections(e) {
            const btn_ViewSaves = document.querySelector("#ab_ctls > li > a.ab_button") || ImagePanel.focP.q('.i18192');
            console.debug('btn_ViewSaves', btn_ViewSaves);
            if (!!btn_ViewSaves) btn_ViewSaves.click();
        });
        mousetrap.bind(['numpad4'], function previousImage(e) {// ◀
            ImagePanel.previousImage();
        }, 'keydown');
        mousetrap.bind(['numpad6'], function nextImage(e) { // ▶
            ImagePanel.nextImage();
        }, 'keydown');

        mousetrap.bind(['?'], toggleShowKeymap, 'keydown');


        // ==== panel-specific bindings ========
        // TODO: maybe it's cleaner to bind the panels using Mousetrap(panel).bind ...

        mousetrap.bind(['v'], function saveToCollections(e) {
            if (!ImagePanel.isPanelCurrentlyOpen) return;

            const btn_Save = ImagePanel.focP.q('.i15087');
            console.debug('btn_Save', btn_Save);
            if (!!btn_Save) btn_Save.click();
        });
        mousetrap.bind(['b', 'numpad1'], function searchByImage(e) {// ⬋ Search by image
            if (!ImagePanel.isPanelCurrentlyOpen) return;

            if (ImagePanel.focP.mainImage) {
                ImagePanel.focP.q('a.search-by-image').click();
            } else {
                console.error('Image not found', ImagePanel.focP.ris_fc_Url);
            }
        }, 'keydown');
        mousetrap.bind(['d', 'numpad5', 'enter'], function downloadCurrentImage() {
            if (!ImagePanel.isPanelCurrentlyOpen) return;

            ImagePanel.downloadCurrentImage();
        }, 'keydown');

        mousetrap.bind(['numpad3'], function open_related_images_in_new_tab(e) {// ⬊ Open related images in new tab
            if (!ImagePanel.isPanelCurrentlyOpen) return;

            const moreRelatedImagesLink = ImagePanel.focP.q('.irc_rismo.irc_rimask a');
            if (moreRelatedImagesLink != null) {
                openInTab(moreRelatedImagesLink.href);
            }
        }, 'keydown');
        mousetrap.bind(['space'], function openCurrentImage(e) {
            if (!ImagePanel.isPanelCurrentlyOpen) return;

            openInTab(ImagePanel.focP.imgUrl);
        });
        mousetrap.bind([',', 'up', 'numpad8'], function prevRelatedImg(e) { // ▲ Prev/Left relImage
            if (!ImagePanel.isPanelCurrentlyOpen) return;

            ImagePanel.prevRelImg();
            e.preventDefault();
        }, 'keydown');
        mousetrap.bind(['.', 'down', 'numpad2'], function nextRelatedImg(e) {// Next related mainImage
            if (!ImagePanel.isPanelCurrentlyOpen) return;

            ImagePanel.nextRelImg();
            e.preventDefault();
        }, 'keydown');
        mousetrap.bind(['o'], ImagePanel.showRis);
        mousetrap.bind(['m'], ImagePanel.download_ris);
        mousetrap.bind(['numpad7'], function visit_page(e) {// ⬉ visit page
            const visitUrl = ImagePanel.focP.buttons.Visit.href;
            // const visitTitleUrl = subtitleEl.href;

            console.log('Visit:', visitUrl);
            openInTab(visitUrl);
        }, 'keydown');
        // Search title
        mousetrap.bind(['numpad9', 's t'], function lookupTitle() {// lookup the image's title.
            ImagePanel.focP.lookupTitle();
        }, 'keydown');
        mousetrap.bind([';'], function siteSearchCurrentImage() {
            if (!ImagePanel.isPanelCurrentlyOpen) return;

            return ImagePanel.focP.siteSearch();
        });

        //

        document.addEventListener('keydown', e => {
            if (e[Preferences.shortcuts.hotkey]) {
                const el = document.elementFromPoint(document.cursor.clientX, document.cursor.clientY);
                if (!el) return;
                const hotkeyEvent = new Event('hotkey');
                hotkeyEvent[Preferences.shortcuts.hotkey] = e[Preferences.shortcuts.hotkey];
                el.dispatchEvent(hotkeyEvent);
            }
        });
        document.addEventListener('keyup', e => {
            if (e[Preferences.shortcuts.hotkey]) {
                const el = document.elementFromPoint(document.cursor.clientX, document.cursor.clientY);
                if (!el) return;
                const hotkeyEvent = new Event('hotkeyup');
                hotkeyEvent[Preferences.shortcuts.hotkey] = e[Preferences.shortcuts.hotkey];
                el.dispatchEvent(hotkeyEvent);
            }
        });

        console.log('added super google key listener');
    }

    function toggleShowKeymap(e) {
        let keymapTable = document.querySelector('#keymap');
        if (keymapTable) {
            keymapTable.toggle();
            return;
        }

        //TODO; collapse duplicate keybindings
        /** @returns {HTMLDivElement} */
        function createKeymapTable(mousetrap = mousetrap) {
            function getKeymap(funcNames = false) {
                return Object.entries(mousetrap._directMap).map(e => {
                    return [e[0].slice(0, e[0].lastIndexOf(':')), funcNames ? (e[1]._name || e[1].name) : e[1]]
                }).filter(entry => !!entry[1] &&
                    (String(entry[1]._name || entry[1].name || entry[1]) !== '_callbackAndReset') &&
                    String(entry[1]._name || entry[1].name || entry[1]).replace(/\s/g, '') !== "function(){_nextExpectedAction=nextAction;++_sequenceLevels[combo];_resetSequenceTimer();}")
            }

            const entries = getKeymap();
            const $table = $($.parseHTML("<table>"));

            // Loop through array and add table cells
            for (const row of entries) {
                const $row = $($.parseHTML(`<tr>`));
                $table.append($row)

                for (let cell of row) {
                    // if not function, then just use the text
                    if (typeof cell !== 'function') {
                        const $td = $($.parseHTML(`<td>${cell}</td>`));
                        $row.append($td);
                    } else {
                        // if function: choose the name as the text and use a link that calls the function when clicked
                        const func = cell;
                        cell = cell._name || cell.name || '_';
                        const $td = $($.parseHTML(`<td><a href="javascript:void(0);">${cell}</a></td>`));
                        $row.append($td);
                        $td.find('a')[0].addEventListener('click', func);
                    }
                }
            }

            // ATTACH HTML TO CONTAINER
            const container = document.createElement('div');
            container.appendChild($table[0]);

            return container;
        }

        // create keymap table
        const keymapTableContainer = $('<div style="height: 700px; overflow: auto"></div>');
        keymapTable = keymapTableContainer.append($(createKeymapTable(mousetrap)).css({
            'left': '30%',
            'width': '30%',
            'top': '10%',
            'z-index': '1002',
            'color': 'rgb(255, 255, 255)',
            'position': 'fixed',
            'text-align': 'center',
            'text-shadow': 'rgb(0, 0, 0) 1px 1px 7px',
            'font-weight': 'bold',
            'background': 'none 0px center repeat scroll rgb(0, 0, 0)',
            'overflow': 'hidden',
            'border-radius': '10px',
        })).attr({
            'id': 'keymap'
        })[0];

        const setKeymapVisibility = function (visible = false) {
            if (visible) {
                keymapTable.style.display = 'block';
                keymapTable.appendChild(keymapTable.styleEl);
                keymapTable.invisibleCover.style.display = 'block';
            } else { // invisible
                keymapTable.style.display = 'none';
                keymapTable.styleEl.remove();
                keymapTable.invisibleCover.style.display = 'none';
            }
        };

        keymapTable.toggle = () => setKeymapVisibility(keymapTable.style.display === 'none');

        // creating the "close" link/button
        const closeLink = $('<a href="#" class="close" style="float: right;">Close</a>').on('click', (e) => setKeymapVisibility(false))[0];
        keymapTable.firstElementChild.before(closeLink);

        // creating blur style (to blur the background)
        keymapTable.styleEl = null;

        addCss('body > *:not(#keymap) { filter: blur(3px); }', 'keymap-bg-blur').then(el => {
            keymapTable.styleEl = el;
            keymapTable.appendChild(keymapTable.styleEl);
        });

        // creating invisible cover (click listener for exiting)
        keymapTable.invisibleCover = $('<div>').css({
            'position': 'fixed',
            'padding': '0px',
            'margin': '0px',
            'top': '0px',
            'left': '0px',
            'width': '100%',
            'height': '100%',
            'background': 'rgba(255, 255, 255, 0.5)',
        }).on('click', (e) => setKeymapVisibility(false))[0];

        Mousetrap.bind('escape', (e) => setKeymapVisibility(false));

        document.body.appendChild(keymapTable);
        keymapTable.after(keymapTable.invisibleCover);
    }

    // attach chgMon to document.body
    function cleanupSearch() {
        console.log('cleanupSearch()');
        const searchBar = document.querySelector(Consts.Selectors.searchBox);
        searchBar.value = cleanDates(searchBar.value).replace(/\s+|[.\-_]+/g, ' ');
    }

    // return true when there will be a change
    function processLocation() {
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

        if (!new URL(location.href).equals(pageUrl)) {
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
        if (id === '') return false;
        for (const metaEl of document.querySelectorAll('div.rg_meta')) {
            if (metaEl.innerText.indexOf(id) > -1) {
                try {
                    return JSON.parse(metaEl.innerText);
                } catch (e) {
                    console.warn('getImgMetaById():', e);
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
     * @returns {HTMLImageElement[]} */
    function getThumbnails(visibleOnly = false) {
        // language=CSS
        const selector = ['div.rg_bx', 'div > a[jsname] img.rg_i'].join();
        if (visibleOnly) {
            return [].filter.call(document.querySelectorAll(selector), e => !/(:none;)|(hidden)/.test(e.style.display));
        }
        return Array.from(document.querySelectorAll(selector));
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
        let i = 0;
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

    // TODO: use jquery to create the elements, it'll be much cleaner
    /**Modify the navbar and add custom buttons
     * @returns {Promise<Element>} the navbarContentDiv
     */
    function injectGoogleButtons() {
        console.log('injectGoogleButtons()');
        const controlsContainer = createElement('<div id="google-controls-container"</div>');
        /*q('#abar_button_opt').parentNode*/ //The "Settings" button in the google images page
        const menuItemsAndButtonsContainer = document.querySelector(Consts.Selectors.menuItemsAndButtonsContainer);
        // auto-click on "tools" if on Google Images @google-specific
        const toolsButton = menuItemsAndButtonsContainer.querySelector('.hdtb-tl, div.PAYrJc > div.ssfWCe');
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
         * @param {boolean=} checked
         * @returns {HTMLDivElement} this label element contains a checkbox input element
         */
        const createGCheckBox = (id, labelText = 'label', onChange = () => null, checked = false) => {
            checked = GM_getValue(id, checked); // load value, fallback to passed value

            const $container = $('<div>').attr({
                'id': id.trim() + '-div',
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

                GM_setValue(id, $checkbox[0].checked);
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
            // TODO: see this nice link, maybe use it one day https://css-tricks.com/value-bubbles-for-range-inputs/

            const default_slider_minImgSize_value = 250;
            Components.minImgSizeSlider = createElement(`<input id="minImgSizeSlider" type="range" min="0" max="3000" value="${default_slider_minImgSize_value}" step="50">`);

            const sliderReading_minImgSize = createElement(`<label for="minImgSizeSlider" id="minImgSizeSliderValue">${Components.minImgSizeSlider.value}x${Components.minImgSizeSlider.value}</label>`);
            Components.minImgSizeSlider.oninput = function () {
                sliderReading_minImgSize.innerHTML = /*'Min Dimensions<br>' +*/ (`${this.value}x${this.value}`);

                // Highlighting images that will be downloaded
                // clearAllEffects(); // TODO: this is being called too much
                for (const img of getThumbnails(true)) {
                    const meta = getMeta(img);
                    const width = meta.ow, height = meta.oh,
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
            const sliderReading_dlLimit = createElement(`<label id="dlLimitSliderValue">${slider_dlLimit.value}</strong>`);
            slider_dlLimit.oninput = highlightSelection;
            slider_dlLimit.onchange = clearEffectsDelayed;


            const tr1 = document.createElement('tr');
            tr1.appendChild(Components.minImgSizeSlider);
            tr1.appendChild(sliderReading_minImgSize);

            const tr2 = document.createElement('tr');
            tr2.appendChild(slider_dlLimit);
            tr2.appendChild(sliderReading_dlLimit);

            const constraintsContainer = document.createElement('tb');
            constraintsContainer.classList.add('sg');
            constraintsContainer.appendChild(tr1);
            constraintsContainer.appendChild(tr2);
            //todo: make the image size slider increment discretely, depending on the available dimensions of the images
            // Sliders

            return constraintsContainer;
        })();

        const satCondLabel = createElement(`<label id="satCondLabel">Images satisfying conditions: 0</label>`);

        // == creating buttons ==

        const btn_dispOgs = createGButton('dispOgsBtn', 'Display <u>o</u>riginals', function () {
            showOriginals();
        });

        const link_animated = createElement(`<a class="sg q qs" href="${location.pathname + location.search + '&tbs=itp:animated'}"><u>A</u>nimated</a>`);

        const btn_preload = createGButton('preloadBtn', 'Preload images ↻', function () {
            const imgs = Array.from(document.querySelectorAll('a[href] img.rg_i'));
            const progressSpan = btn_preload.querySelector('span.preload-progress');
            let counter = 0;
            progressSpan.innerText = `(${counter}/${imgs.length})`;
            Promise.all(Array.from(imgs).map(img => ShowImages.loadPromise(img, [img.src || img.getAttribute('data-src')]).then(res => {
                progressSpan.innerText = `(${++counter}/${imgs.length})`;
            }))).then(res => {
                console.log("YAAA!!! preloaded all these images:", imgs)
            });
        });
        btn_preload.appendChild(createElement('<span class="preload-progress" style="margin: 5px;">'));

        const btn_downloadJson = createGButton('dlJsonBtn', 'Download JSON {}', downloadJSON);
        const btn_trimSiteLeft = createGButton('trimSiteLeft', '[', siteSearch_TrimLeft);

        const btn_showKeymap = createGButton('showKeymap', '(?) keymap', toggleShowKeymap);

        const btn_download = createGButton('downloadBtn', 'Download EVERYTHING ⇓', downloadImages);
        btn_download.style.margin = '20px';
        btn_download.style.border = '20px';
        btn_download.innerHTML = cbox_ZIP.checked ? 'ZIP&nbsp;images' : `Download&nbsp;⇓`;

        const downloadPanel = createElement('<div id="download-panel" style="display: block;"></div>');

        // Appending buttons to downloadPanel
        for (const el of [cbox_ZIP, cbox_closeAfterDownload, btn_download, btn_preload, btn_downloadJson, constraintsContainer]) {
            downloadPanel.appendChild(el);
        }

        // TODO: move this to another function, where it will also be appended with the web search (not only the image search)
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
        const defaultDownlodPath = 'SG_Downloads';
        const pathBox = createElement(`<div class="sg" style="display: inline;"> <input id="download-path" value="${defaultDownlodPath}"><label>Download path</label> </div>`);

        const divider = document.createElement('div');
        controlsContainer.appendChild(divider);

        // appending buttons and controls
        divider.after(btn_dispOgs, cbox_ShowFailedImages, cbox_GIFsOnly, cbox_UseDdgProxy, cbox_GIFsException, cbox_OnlyShowQualifiedImages, link_animated, searchEngineSelect, pathBox, btn_showKeymap, downloadPanel);
        constraintsContainer.after(satCondLabel);
        downloadPanel.appendChild(createElement(`<div id="progressbar-container"></div>`));


        return createAndGetNavbar().then(function (navbarContentDiv) {
            // const gNavbar = document.querySelector('#rshdr, header > div:nth-child(1)');
            // navbarContentDiv.before(gNavbar, document.querySelector('#searchform'));
            navbarContentDiv.appendChild(controlsContainer).after(document.querySelector('#navbar-hover-sensor'));
            return navbarContentDiv;
        });
    }

    /**
     * @param {HTMLImageElement[]=} thumbnails - optional
     * @returns {Promise[]}
     */
    function showOriginals(thumbnails) {
        shouldShowOriginals = true;
        thumbnails = thumbnails || getThumbnails();
        ImagePanel.showRis();

        return [].map.call(
            thumbnails,
            // some may not have been replaced with direct links yet, so wait until that happens then showImages
            img =>
                // img && img.matches('img[fullres-src]') ? // HACK: we shouldn't need this, elementReady should handle this but ok fine it works...
                showImages.replaceImgSrc(img)
            // :elementReady(img => img && img.matches('img[fullres-src]'))
            //     .then(() => showImages.replaceImgSrc(img))
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

    function downloadImages() {
        const zipBox = document.querySelector('#zipInsteadOfDownload');
        const qualifiedGImgs = getQualifiedGImgs({
            exception4smallGifs: document.querySelector('#GIFsExceptionBox').checked
        });
        if (zipBox && zipBox.checked) {
            if (!zip || Object.keys(zip.files).length < 1) {
                gZipImages();
            } else {
                if (zip) zip.genZip();
            }
        } else {
            if (currentDownloadCount >= document.querySelector('#dlLimitSlider').value) {
                currentDownloadCount = 0;
            } else {
                console.log('currentDownloadCount < dlNumSlider.value');
            }

            let i = 0;
            const btns = [].map.call(qualifiedGImgs, img => img.parentElement.querySelector('.download-block'));
            const interval = setInterval(function () {
                if (i < Math.min(btns.length, document.querySelector('#minImgSizeSlider').value))
                    btns[i++].click();
                else
                    clearInterval(interval);
            }, 100);
        }
    }

    /**
     * Note: an error is thrown if getMeta() fails
     * @param img
     * @returns {string} (jpg|jpeg|tiff|png|gif)
     */
    function getExt(img) {
        const meta = getMeta(img);
        function getRegExpMatchArrayElement(s) {
            if (!s) return '';
            const match = s.match(/\.(jpg|jpeg|tiff|png|gif)($|[?&])/i);
            return !!match && match.length ? match[1] : '';
        }
        let ext = meta.ity
            || getRegExpMatchArrayElement(meta.ou)
            || getRegExpMatchArrayElement(meta.src);

        if (typeof (ext) === 'object') ext = ext[1];
        return ext || '';
    }
    /**
     * @param {(Element|Meta)} img_bx - image box or image or meta
     * @returns {boolean}
     */
    function isGif(img_bx) {
        try {
            return getExt(img_box) === 'gif';
        } catch (e) {
            return false;
        }
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
     * @returns {(ImgBox|HTMLImageElement)[]} list of images that match, (they will have img.url).
     *
     */
    function getQualifiedGImgs(parameters = {}) {
        let {exception4smallGifs, ignoreDlLimit = false} = parameters;

        const dlLimitSlider = document.querySelector('#dlLimitSlider');
        const dlLimit = dlLimitSlider ? dlLimitSlider.value : Number.MAX_SAFE_INTEGER;

        return [].filter.call(document.querySelectorAll('img.rg_i:not([loaded="error"])'), (img, i) => {
            const qualDim = !img.hasOwnProperty('satisfiesDimensions') || img.satisfiesDimensions || exception4smallGifs && isGif(img.meta);
            return (qualDim && (ignoreDlLimit || i < dlLimit));
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

        return meta;
    }

    /**
     *
     * @param img
     * @returns {Promise<Meta>}
     */
    function getMetaPromise(img) {
        return elementReady(function (mutationRecord) {
            const meta = getMeta(img);
            if (Object.keys(meta).length !== 0) {
                return meta;
            }
        });
    }

    function enhanceImageBox(imageBox) {
        imageBox.classList.add('rg_bx_listed'); // adding a class just to keep track of which one's were already done

        // there are two cases, either an imageBox or an ris image
        let img = imageBox.querySelector('img.rg_i, img.irc_rii');
        if (!img) return;

        const isRelatedImage = !!img.closest('#islsp'); // not an imageBox (rather it's one of the related images in the panels)

        // defining properties
        imageBox.img = img;
        if (!isRelatedImage) {
            img.__defineGetter__('meta', () => getMeta(img));
            img.__defineGetter__('satisfiesDimensions', () =>
                img.meta.ow >= Components.minImgSizeSlider.value && img.meta.oh >= Components.minImgSizeSlider.value
            );

            // choosing one of them (prioritizing the description over the title)
            img.__defineGetter__('alt', () => {
                const title = [img.meta.pt, img.meta.s].join('_');
                img.setAttribute('alt', title);
                return title;
            });
            img.__defineGetter__('name', () => {
                const title = [img.meta.pt, img.meta.s].join('_');
                img.setAttribute('name', title);
                return title;
            });

            img.classList.add('blur');
        } else {
            addImgExtensionBox(imageBox);
            addImgDownloadButton(imageBox);
        }

        // just wait until exists `meta`, cuz some of them didn't load yet
        elementReady(() => getMeta(imageBox)).then(function () {
            addImgExtensionBox(imageBox);
            addImgDownloadButton(imageBox);
        });

        /**
         * Adds a mouseover listener to showOriginal if you hover over an image for a moment
         */
        const addHoverListener = (function () {
            let pageX = 0;
            let pageY = 0;

            return function (imgBx) {
                let timeout = null;
                const checkAndResetTimer = e => {
                    if (!(pageX === e.pageX && pageY === e.pageY)) {
                        // console.log(`mouse has moved, is: (${e.clientX}, ${e.clientY}) was: (${pageX}, ${pageY})`);
                        clearTimeout(timeout);
                    }
                };

                function replaceImg() {
                    showImages.replaceImgSrc(imgBx.img, imgBx.img.closest('a'));
                }

                const onMouseUpdate = (e) => {
                    if (e[Preferences.shortcuts.hotkey]) {
                        replaceImg();
                    }

                    checkAndResetTimer(e);
                    imgBx.mouseX = e.clientX;
                    imgBx.mouseY = e.clientY;
                    if (!(Preferences.page.showImgHoverPeriod < 0)) // if not negative
                        timeout = setTimeout(function () {
                            checkAndResetTimer(e);
                            replaceImg();
                        }, Preferences.page.showImgHoverPeriod);
                };

                imgBx.img.addEventListener('hotkey', replaceImg, false);
                imgBx.addEventListener('hotkey', replaceImg, false);

                imgBx.addEventListener('mousemove', onMouseUpdate, false);
                imgBx.addEventListener('mouseenter', onMouseUpdate, false);
                imgBx.addEventListener('mouseout', () => clearTimeout(timeout));
            };
        })();

        /**
         * Add small text box containing image extension
         * @param {HTMLDivElement} imgBox
         */
        function addImgExtensionBox(imgBox) {
            if (imgBox.querySelector('.text-block')) return;

            const img = imgBox.querySelector('img.rg_i, img.irc_rii');
            const link = img.closest('a');

            getMetaPromise(img).then((meta) => {
                const ext = getExt(img);

                if (!ext) return;

                let gifboxDiv = link.querySelector('div.bMBVpc');
                // if gif: adding a gif-label at the bottom left corner
                if (ext === 'gif') {
                    if (!gifboxDiv) gifboxDiv = createElement('<div class="bMBVpc">'); // "div.bMBVpc"

                    if (!gifboxDiv.querySelector('svg')) { // if it doesn't already have the giflabel, put it
                        // goes right before the image
                        img.before(gifboxDiv);
                        // this is the copied html of the gif-label from the official mobile site
                        gifboxDiv.innerHTML = '<div class="gJNf0"><div class="PMxv3e rg_ai"><div class="GQDPdd">' +
                            '<span class="S2Caaf BmvKjd z1asCe Y6aT2b" style="height:30px;line-height:30px;width:30px">' +
                            '<svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
                            '<path d="M11.5 9H13v6h-1.5zM9 9H6c-.6 0-1 .5-1 1v4c0 .5.4 1 1 1h3c.6 0 1-.5 1-1v-2H8.5v1.5h-2v-3H10V10c0-.5-.4-1-1-1zm10 1.5V9h-4.5v6H16v-2h2v-1.5h-2v-1z">' +
                            '</path></svg></span></div></div></div>';

                        // moving resolution anchor to the side to prevent blocking
                        const resolutionAnchor = link.querySelector('.rg_ilmbg');
                        if (resolutionAnchor) resolutionAnchor.style.left = '28px';
                    }
                } else if (gifboxDiv) { // not gif, remove giflabel
                    gifboxDiv.innerHTML = '';
                }

                imgBox.querySelector('a').classList.add('ext', `ext-${ext}`);//TODO: make anchor selector more specific
            });
        }
        function addImgDownloadButton(imgBox) {
            if (imgBox.querySelector('.download-block'))
                return;

            const img = imgBox.querySelector('img.rg_i, img.irc_rii');
            const link = img.closest('a');
            const meta = getMeta(img);

            const downloadImage = function (e = {}) {
                const src = img.getAttribute('loaded') === 'true' ? img.src : img.getAttribute('fullres-src') || meta.ou || 'META.OU IS UNDEFINED!';
                const fileName = unionTitleAndDescr(meta.s, unionTitleAndDescr(meta.pt, meta.st)) + meta.ity;
                download(src, fileName, {fileExtension: meta.ity});
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
        let div;
        if (img.tagName === 'DIV') {
            div = img;
            img = div.querySelector('img');
        } else {
            div = img.closest(`div.irc_rimask, div.rg_bx, #islrg > div.islrc > div`);
            // nearest parent div container, `div.rg_bx, #islrg > div.islrc > div` for thumbnails and `div.irc_rimask` for related images
        }


        const getFakeRisMeta = ris_img => {
            const titleDiv = ris_img.querySelector('a.iKjWAf.irc-nic.isr-rtc .nJGrxf');
            return ({
                ou: ris_img.getAttribute('fullres-src'),
                pt: titleDiv ? titleDiv.innerText : '',
            });
        };

        let metaObj = {};
        if (!img)
            return metaObj;

        if (img._meta && Object.entries(img._meta).filter(([, v]) => !!v).length !== 0) {
            return img._meta;
        }

        try {
            const dataved = div ? div.getAttribute('data-ved') : '';
            const selector = `div.rg_bx, #islrg > div.islrc > div[data-ved="${$.escapeSelector(dataved)}"] div.rg_meta`;
            const rg_meta = div.querySelector('.rg_meta') || document.querySelector(selector);
            if (rg_meta && !Object.keys(metaObj).length) {
                metaObj = JSON.parse(rg_meta.innerText);
            } else {
                metaObj = getFakeRisMeta(img);
            }

            metaObj.src = img.src;
            metaObj.dim = [metaObj.ow, metaObj.oh];
            metaObj.imgEl = img;
            img._meta = metaObj;

        } catch (e) {
            metaObj = getImgMetaById(img.id);
            // if (debug) console.warn(e, img);
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
        const o = {};
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
                if (!url) return '';
                fakeLink.href = url;
                return fakeLink.href;
            };
        })();

        /**
         * - purifyLink
         * - remove "onmousedown"
         * - set rel="noreferrer", referrerpolicy="no-referrer"
         * - stopImmediatePropagation onclick */
        const enhanceLink = function (a) {
            // at this point, href= the gimg search page url
            /** stop propagation onclick */
            const purifyLink = function (a) {
                if (/\brwt\(/.test(a.getAttribute('onmousedown'))) {
                    a.removeAttribute('onmousedown');
                }

                if (a.matches('[jsaction*="click"]') || a.parentElement && a.parentElement.matches('[jsaction*="click"]')) {
                    a.addEventListener('click', function (e) {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                        e.preventDefault();
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
            const imgs = [].slice.call(link.querySelectorAll('div~img'));
            if (imgs.length > 0) imgs.forEach(function (img) {
                if (o.debug) console.log('img fullres-src="' + link.href + '"');
                img.setAttribute('fullres-src', link.href); //@faris

                //FIXME: maybe just use a mutationobserver instead? cuz this is problematic
                //DEBUG: checking what the hell is causing "&reload=on"
                img.__defineGetter__('src', () => normalizeUrl(img.getAttribute('src')));
                img.__defineSetter__('src', (value) => {
                    if (/&reload=on/.test(value))
                        if (o.debug) console.trace('image has been set with "&reload=on"!!!!!', img, value);

                    return img.setAttribute('src', value.replace(/&reload=on$/, ''));
                });

                // img.phref = phref; //@faris
            });

            const pageUrl = decodeURIComponent(url.match(/[?&]imgrefurl=([^&#]+)/)[1]);
            for (const info of link.querySelectorAll('img~div')) {
                const pagelink = document.createElement('a');
                enhanceLink(pagelink);
                pagelink.href = pageUrl;
                pagelink.className = 'x_source_link';
                pagelink.textContent = info.textContent;
                info.textContent = '';
                info.appendChild(pagelink);
            }

            //@faris
            // @info about html @structure:

            /*
             *<a class="iKjWAf irc-nic isr-rtc a-no-hover-decoration">
             *     <div class="mVDMnf nJGrxf">cool cat pic</div>
             *     <div class="nJGrxf FnqxG">
             *         <span>example.com</span>
             *     </div>
             *</a>
             */

            //goal:
            /*
             * <a class="iKjWAf irc-nic isr-rtc a-no-hover-decoration phref panel-page footLinkTop">
             *     <div class="mVDMnf nJGrxf">
             *         <span class="info-span">cool cat pic</span>
             *     </div>
             * </a>
             * <a class="iKjWAf irc-nic isr-rtc a-no-hover-decoration host-page footLink">
             *     <div class="nJGrxf FnqxG">
             *         <span class="site-span" style="display:none">site:</span>
             *         <span class="hostname-spane">example.com</span>
             *     </div>
             * </a>
             */


            // footlink is the main link, it will be duplicated and the description text will be moved and used as the panelpage link

            // splitting the 2 lines of the footlink to 2 links, one with the phref
            const footLink = link.parentElement.querySelector('a.irc-nic'); // the info link with the host-page
            if (!footLink) {
                console.warn("footLink is null!", link.href);
                return;
            }
            let footLinkTop = footLink.parentElement;
            if (footLinkTop) footLinkTop = footLinkTop.querySelector('.panel-page.phref[phref]'); // FIXME: sometimes the parentElement is undefined
            if (footLink && !footLinkTop) {
                /*
                 * footLinkTop:
                 *      contains the title/description, links to the panelpage
                 *      iKjWAf irc-nic isr-rtc a-no-hover-decoration phref panel-page footLinkTop ext
                 *
                 * footLink:
                 *      at the bottom, links to the hostpage
                 *      iKjWAf irc-nic isr-rtc a-no-hover-decoration host-page footLink
                 */
                footLinkTop = footLinkTop || footLink.cloneNode(false);
                footLinkTop.classList.remove('host-page', 'footLink');
                footLinkTop.classList.add('panel-page', 'phref', 'footLinkTop');
                footLinkTop.phref = phref;
                footLinkTop.setAttribute('phref', phref);
                footLinkTop.href = phref;
                footLinkTop.setAttribute('href', phref);
                enhanceLink(footLinkTop);

                footLink.classList.add('host-page', 'footLink');
                footLink.classList.remove('phref', 'footLinkTop');
                enhanceLink(footLink);


                // get first div and move it up
                const infoDivTop = footLink.querySelector('div.mVDMnf.nJGrxf');
                footLinkTop.appendChild(infoDivTop);
                // make sure that there is a span, not just innerText
                if (!infoDivTop.querySelector('span')) {
                    infoDivTop.innerHTML = '<span class="info-span">' + infoDivTop.innerText + '</span>';
                }

                const footLinkDiv = footLink.querySelector('div.nJGrxf.FnqxG') || createElement(`<div class="nJGrxf FnqxG">`);
                const hostpageSpan = footLinkDiv.querySelector('span') || // get existing hostpageSpan or create it
                    createElement(`<span class="hostname-spane">${getMeta(link.closest('div')).isu}</span>`);
                footLink.appendChild(footLinkDiv);
                footLinkDiv.appendChild(hostpageSpan);
                const siteSpan = createElement('<span class="site-span" style="display:none">site:</span>');

                hostpageSpan.classList.add('hostname-spane');
                hostpageSpan.before(siteSpan);

                // hold hotkey and click to site:search
                {
                    const __restoreFootlink = function (theLink) { // returning the original (hostpage) link
                        theLink.setAttribute('href', pageUrl);
                        siteSpan.style.display = 'none';
                    };

                    const handleHover = function (e) {
                        if (e[Preferences.shortcuts.hotkey]) { // change to site:search
                            footLink.oghref = footLink.href;
                            const span = footLink.querySelector('div > span:not(.site-span)');
                            const sitesearchUrl = GoogleUtils.url.siteSearchUrl(span.innerText);
                            footLink.setAttribute('href', sitesearchUrl);
                            siteSpan.style.display = 'inline';
                        } else {
                            __restoreFootlink(footLink);
                        }
                    };

                    hostpageSpan.addEventListener('hotkey', e => e[Preferences.shortcuts.hotkey] && handleHover(e), false);
                    hostpageSpan.addEventListener('hotkeyup', e => e[Preferences.shortcuts.hotkey] && __restoreFootlink(footLink), false);

                    const parentDiv = footLink.closest('div');
                    parentDiv.addEventListener('hotkey', e => e[Preferences.shortcuts.hotkey] && handleHover(e), false);
                    parentDiv.addEventListener('hotkeyup', e => e[Preferences.shortcuts.hotkey] && __restoreFootlink(footLink), false);

                    footLink.addEventListener('hotkey', e => e[Preferences.shortcuts.hotkey] && handleHover(e), false);
                    footLink.addEventListener('hotkeyup', e => e[Preferences.shortcuts.hotkey] && __restoreFootlink(footLink), false);

                    footLink.addEventListener('key', e => e[Preferences.shortcuts.hotkey] && handleHover(e), false);
                    footLink.addEventListener('mouseenter', handleHover, false);
                    footLink.addEventListener('mousemove', handleHover, false);
                    footLink.addEventListener('mousedown', handleHover, false);
                    footLink.addEventListener('mouseout', e => __restoreFootlink(footLink), false);
                    footLink.addEventListener('mouseleave', e => __restoreFootlink(footLink), false);
                }

                footLink.before(footLinkTop);
            }

        };

        /**
         * replace redirect and dataUris
         *
         * @param {*|HTMLAnchorElement} link
         * @param {string=} url
         */
        o.restore = function (link, url) {
            const oldUrl = link.getAttribute('href') || '';
            const newUrl = (url || oldUrl || '').replace(/&reload=on/, '');

            let matches = newUrl.match(re);
            if (!matches) {
                matches = newUrl.match(/[?&]imgrefurl=([^&#]+)/);
                if (matches) {
                    matches = decodeURIComponent(matches[1]);
                }
            }
            if (matches) {
                if (o.debug) console.log('restoring', link._x_id, `"${newUrl}"`);

                link.phref = oldUrl;
                link.setAttribute('phref', oldUrl); //@faris just saving the old panel href

                link.href = decodeURIComponent(matches[2]);
                // enhanceLink(link);
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


        // will only handle redirect links that pass this filter (must return true)
        const filter = a => !(a.parentElement && a.parentElement.classList.contains('text-block'))
            // /^\/imgres\?imgurl=/.test(a.getAttribute('href')) &&
            // && !(a.matches('.host-page, .irc_lth')) // replace anything that isn't a host-page or irc_lth link
            // (a.matches('.rg_l, .irc_mi'))
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
            if (o.debug) a.setAttribute('x-id', a._x_id);

            a.__defineSetter__('href', function setter(v) {
                // in case an object is passed by clever Google
                o.restore(this, String(v));
            });
            a.__defineGetter__('href', function getter() {
                if (o.debug) console.log('get(', this._x_id, '):', `"${this.getAttribute('href')}"`, this);
                return normalizeUrl(this.getAttribute('href') || '');
            });

            if (/^_(?:blank|self)$/.test(a.getAttribute('target')) ||
                /\brwt\(/.test(a.getAttribute('onmousedown')) ||
                /\bmouse/.test(a.getAttribute('jsaction')) ||
                a.parentElement && /\bclick\b/.test(a.parentElement.getAttribute('jsaction'))) {
                enhanceLink(a);
            }

            o.restore(a);
        };

        const checkAttribute = function (mutation) {
            const target = mutation.target;

            if (target && target.tagName === 'A') {
                if ((mutation.attributeName || mutation.attrName) === 'href') {
                    if (o.debug) console.log('restore attribute', target._x_id, `"${target.getAttribute('href')}"`);
                }
                handler(target);
            } else if (target instanceof Element) {
                target.querySelectorAll('a').forEach(handler);
            }
        };
        // observe
        o.checkNewNodes = function (mutations) {
            // if (o.debug) console.log('State:', document.readyState);
            if (mutations.target) {
                checkAttribute(mutations);
            } else {
                if (mutations.forEach) mutations.forEach(checkAttribute);
            }
        };


        o.observe = () => {
            const MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
            if (MutationObserver) {
                if (o.debug) console.log('MutationObserver: true');
                new MutationObserver(o.checkNewNodes).observe(document.documentElement, {
                    childList: true,
                    attributes: true,
                    attributeFilter: ['href'],
                    subtree: true
                });
            } else {
                if (o.debug) console.log('MutationEvent: true');
                document.addEventListener('DOMAttrModified', checkAttribute, false);
                document.addEventListener('DOMNodeInserted', o.checkNewNodes, false);
            }
        };

        return o;
    }

    function getPanelPage(meta) {
        let img;
        if (meta instanceof HTMLImageElement) {
            img = meta;
            meta = getMeta(img);
        }

        const currentParams = Object.fromEntries(new URL(location.href).searchParams.entries());

        const data = {
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
        const combined = $.extend(currentParams, data);


        return normalizeUrl('/imgres?' + $.param(combined));
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
        return document.querySelectorAll('#rg_s > div.rg_bx, #islrg > div.islrc > div' + selectorExtension);
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
    function getResultsData(minified = false) {
        let imgBoxes = getImgBoxes();
        let set = new Set();
        for (let box of imgBoxes) {
            let img;
            let meta = {};

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

        const metas = getResultsData(options.minified);

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
        return options.stringifySafe ? JSON.stringifySafe(o, null, 4) : o;
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
        })], {type: 'text/plain'}));

        zip.onGenZip = e => {
            const closeAfterZip = document.querySelector('#closeAfterDownload');
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
        const regex = new RegExp(str2.match(RegExp('[^$-/:-?{-~!"^_\`\\[\\]]+', 'g')).join('|'), 'gi');
        const str1MinusStr2 = str1.replace(regex, ' ');
        return removeDoubleSpaces(str1MinusStr2 + ' ' + str2);
    }
    function unionStrings(str1, str2) {
        const words1 = str1.split(/\s+/g),
            words2 = str2.split(/\s+/g),
            resultWords = [];
        let i,
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
        // let bxs = qa(`div.rg_bx, #islrg > div.islrc > div > a.rg_l > img.${Consts.ClassNames.FAILED_DDG}, div.rg_bx, #islrg > div.islrc > div > a.rg_l > img.${Consts.ClassNames.FAILED}`);

        const _filter = (typeof (filter) === 'string') ?
            (el) => el.matches(filter) :
            filter;

        //debug: TODO: should be removed later, these are just for debugging
        const pm = [];
        const nm = [];

        for (const imageBox of getImgBoxes(' img.rg_i')) {
            if (negateCondition ^ _filter(imageBox)) {// match
                setVisible(imageBox, visibility);
                pm.push(imageBox);
            } else if (invertVisibilityForNegativeMatches) {
                setVisible(imageBox, !visibility);
                nm.push(imageBox);
            }
        }

        //debug: TODO: remove later
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
        const rx = new RegExp(subStr, 'i');
        if (rx.test(el.innerHTML)) {
            const oldInnerHTML = el.innerHTML;
            const newHTML = el.innerHTML.replace(rx, `<span class="underlineChar" style="text-decoration: underline;">${subStr}</span>`);
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
        //TODO: needs update for new selectors
        const menuItems = document.querySelector([
            '#hdtb-msb',
            '.tAcEof',
            'div.O850f > div > div'
        ].join(', '))
            .querySelectorAll('div > div > div > a');
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

    unsafeWindow.getImgMetaById = getImgMetaById;

    unsafeWindow.geResultsData = getResultsData;
    unsafeWindow.downloadJSON = downloadJSON;

    unsafeWindow.getMeta = getMeta;


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


    function createStyles() {
        // language=CSS - gif labels
        addCss(`
            .gJNf0, .sP8UF {
                box-sizing: border-box;
                font-family: Roboto, HelveticaNeue, Arial, sans-serif;
                line-height: 12px;
                margin-left: 0;
                overflow: hidden;
                position: absolute;
                white-space: nowrap;
                background: rgba(255, 255, 255, 0.9);
                bottom: 0;
                border-radius: 0 2px 0 0;
                box-shadow: 0 0 1px 0 rgba(0, 0, 0, .16);
                color: #70757a;
                font-size: 10px;
                padding: 4px;
            }

            /*for the giflabels (div)*/
            .bMBVpc, .irc-rito {
                z-index: 5;
                background-color: rgba(0, 0, 0, .03);
                height: 100%;
                pointer-events: none;
                position: absolute;
                width: 100%;
            }

        `, 'gif-label');


        // language=CSS - Overlay CSS for highlighting selected images
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

        // GoogleDirectLinksPagesImages script css
        addCss('a.x_source_link {' + [
            'line-height: 1.0',  // increment the number for a taller thumbnail info-bar
            'text-decoration: none !important',
            'color: inherit !important',
            'display: block !important'
        ].join(';') + '}', 'GoogleDirectLinksPagesImages-script-css');

        // give a white border so that we'll have them all the same size
        addCss('div.rg_bx, #islrg > div.islrc > div { border-radius: 2px;border: 3px #fff solid;}', 'white-borders');

        // toolbar
        // language=CSS
        addCss(`/*sg=SuperGoogle, this is padding for the buttons and controls*/
        .sg {
            margin: 8px;
        }

        label[for] {
            padding: 2px;
            border-radius: 4px;
            background: darkgrey;
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

        input[type="range"] + label { /*The label elements displaying the slider readings*/
            padding: 6px;
        }
        `, 'toolbar');

        // language=CSS
        addCss(`
            .hover-click:hover,
            .hover-click:focus {
                color: #999;
                text-decoration: none;
                cursor: pointer;
            }


            /* image panel title&description container (The right upper part)*/
            div.irc_hd * {
                margin-right: 3px;
                margin-bottom: 2px;
            }

            div#extrares {
                display: none !important;
            }

            /*bigger space between image boxes*/
            div.rg_bx, #islrg > div.islrc > div {
                margin: 10px;
            }

            /*fixes size of main image link*/
            /*description*/
            div.irc_asc {
                display: inline-block !important;
            }

            .irc_ris {
                height: fit-content !important;
            }

            /*primary title a.irc_pt: so it won't take more space than it should*/
            a.irc_pt {
                display: contents !important;
            }

            /*for the imagebox info link*/
            a.iKjWAf.irc-nic.isr-rtc.a-no-hover-decoration {
                padding: 2px 4px 0 0;
                /*display: contents;*/
            }

            /*for .site-span container (the info text on the ris images)*/
            #irc_bg a.iKjWAf.irc-nic.isr-rtc.a-no-hover-decoration.panel-page {
                bottom: 15px;
                z-index: 5;
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

            /*TODO: split this to multiple addCss() calls*/
            .ext-gif {
                background-color: #4b00ff8c !important
            }

            div.text-block.ext:not(.ext-gif) {
                background-color: #00cbff;
            }

            a.download-related, a.show-ris {
                border-radius: 4px;
                border: #454545 2px solid;
                background-color: #454545;

                margin-right: 8px;
                margin-left: 8px;

                box-shadow: 0 1px 0 rgba(255, 255, 255, .06),
                1px 1px 0 rgba(255, 255, 255, .03),
                -1px -1px 0 rgba(0, 0, 0, .02),
                inset 1px 1px 0 rgba(255, 255, 255, .05);
            }

            /*
            .scroll-nav:hover,
            .scroll-nav *:hover:not(.hover-click),
            .scroll-nav *:focus:not(.hover-click) {
                cursor: crosshair;
            }
            */

            /*coloring links, make them easier to see*/
            .mblink:visited, a:visited {
                color: #d684ff;
            }

            a:link, .w, #prs a:visited, #prs a:active, .q:active, .q:visited, .kl:active, .tbotu {
                color: #988fff;
            }
        `, 'panel');

    }


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

    function reAdjustAfterScrollEdge(el = null) {
        if (el === null) {
            el = document.querySelector("#irc-ss");
        }
        if (!el) return;

        const newTopPos = 1.0 - (e.progress);

        // limit for user scrolling to top? (limit for panel coming down)
        const topLimit = document.querySelector("#navbar-content").clientHeight * 1.8;
        // limit for user scrolling to bottom? (limit for panel going up)
        const bottomLimit = -(document.querySelector("#navbar").scrollHeight - 50);

        // maps from a range to another range linearly (just like the Arduino map function)
        function mapValue(x, in_min, in_max, out_min, out_max) {
            return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
        }

        const mapped = mapValue(newTopPos, 0.0, 1.0, bottomLimit, topLimit);
        document.querySelector("#irc_bg").style.top = String(mapped) + 'px';
    }

    /**
     * Creates a static navbar at the top of the page.
     * Useful for adding buttons and controls to it
     *  do NOT just take the returned value and start adding elements.
     *  @return {Promise<Element | any>} returns the parent navbar element
     */
    function createAndGetNavbar() {
        // Settings up the navbar
        const DELAY_UNTIL_HIDE = 2000;

        /*for moving the footcnt bar at the bottom more to the bottom*/
        // language=CSS
        addCss(`
        div#navbar {
            position: fixed;
            z-index: 2;
            height: 10px;
            top: 0;
            right: 0;
            left: 0;
            
            width: 100%;
            transition: top 0.1s;
        }
        
        /*#footcnt {
            bottom: -354px;
            position: absolute;
        }*/
        
        /*keep the background white for the navbar*/
        .rshdr {
            background: rgb(255, 255, 255);
        }
        
        .fixed-position ${Preferences.page.staticNavbar ? ', #rshdr, header > div:nth-child(1), #top_nav' : ''} {
            position: fixed;
            top: 0;
            z-index: 1000;
        }
        
        #google-controls-container {
            padding: 10px;
            background: #727272;
        }

        div#navbar-content {
            z-index: -1;
            margin: 5px;
            font-family: inherit;
            /*font-stretch: extra-condensed;
            font-size: 20px;*/
            transition: top 0.3s;
            position: relative;
        }`, 'navbar-css');

        addCss(`#irc_bg { transition: top 0.5s; }`);


        const $navbarContent = $('<div id="navbar-content"></div>');
        // this will be added later
        const $navbar = $('<div id="navbar"></div>').append($navbarContent).append($('<div id="navbar-hover-sensor" style="height: 30px;"></div>'));
        const nbarContent = $navbarContent[0];

        // adding some handy functions
        /**
         * @param e
         * @param pos - 0 is hide, 1 is show
         */
        nbarContent.setNavbarPos = function (e, pos = 0) {
            clearTimeout(nbarContent.timeout);
            nbarContent.timeout = setTimeout(() => nbarContent.setNavbarPos(e, 0), DELAY_UNTIL_HIDE);

            const googleControlsContainer = document.querySelector('#google-controls-container');
            nbarContent.style.top = `${(pos - 1) * googleControlsContainer.clientHeight}px`;
            nbarContent.pos = pos;
        };

        // make physical div to push elements down
        const $physicalDiv = $('<div id="navbar-phys" style="position:relative;display:table;height:50px;">'); // this div pushes all the bellow content (so the navbar won't cover it)
        $navbar.after($physicalDiv);

        const rshdr = document.querySelector("#rshdr, header > div:nth-child(1)");
        const searchform = document.querySelector('#searchform');
        rshdr.append($navbar[0], searchform);

        function reAdjustTopMargin(e) { // moves the rest of the page down a bit so it won't be covered by the navbar
            nbarContent.timeout = setTimeout(() => nbarContent.setNavbarPos(e, 0), DELAY_UNTIL_HIDE);
            return;

            // document.body.style.position = 'relative';
            const clientHeight = document.querySelector('#navbar-content').offsetTop + 200;

            $physicalDiv.css({
                'height': (clientHeight) + 'px'
            });
        }
        // $(window).on('DOMContentLoaded load resize scroll', reAdjustTopMargin);
        // observe for elements being added, need to readjust topMargine
        // observeDocument(reAdjustTopMargin, {baseNode: '#navbar'});

        return elementReady('#navbar-content').then((navbarContent) => {
            // auto-hide the navbar when scrolling down
            // @author taken from example: https://www.w3schools.com/howto/tryit.asp?filename=tryhow_js_navbar_hide_scroll

            const navbarHoverSensor = $('#navbar-hover-sensor')[0];

            const onscrollAutoHideNavbar = function (e) {
                const delta = getWheelDelta(e);

                // if sidepanel, just always hide the navbar (doesn't matter if scrolling up or down)
                const sidepanelScrollEl = document.querySelector(Consts.Selectors.sidepanelScrollEl);
                if (sidepanelScrollEl && new Set(e.path).has(sidepanelScrollEl)) {
                    navbarContent.setNavbarPos(e, 0);
                    return;
                }

                if (delta < 0 || navbarContent.pos > 1) { // if scrolled down, hide
                    navbarContent.setNavbarPos(e, 0);
                } else { // show
                    navbarContent.setNavbarPos(e, 1);
                }
            };

            // bind to main images container
            elementReady("#isr_mc").then(function (mainImagesContainer) {
                mainImagesContainer.addEventListener('wheel', onscrollAutoHideNavbar);
            });

            // sidepanel scroll handler
            elementReady(Consts.Selectors.sidepanelScrollEl).then(function (sidepanelScrollEl) {
                sidepanelScrollEl.addEventListener('wheel', (e) => navbarContent.setNavbarPos(e, 0));
            });


            // when hovering over the google toolbars, move the navbar down
            $([navbarContent, navbarHoverSensor]).on('mouseover mousemove', function (e) {
                // moveNavbarDown
                if (navbarContent.pos <= 1) {
                    navbarContent.setNavbarPos(e, 1);
                }
            }).on('mouseout', function (e) {
                // when not hovering, set a timer to go back
                // nbarContent.timeout = setTimeout(() => nbarContent.setNavbarPos(e, 0), DELAY_UNTIL_HIDE);
            });

            $('#navbar').on('wheel scroll scrollwheel', (e) => {
                console.log('navbar: onscroll:', e);
                onscrollAutoHideNavbar(e);
            });

            // bind listeners to these elements, for showing and hiding the navbar when scrolled to top
            // when hovering over the google toolbars, move the navbar down
            $('#top_nav, #sfcnt, #searchform').on('mouseover mousemove', function (e) {
                // show navbar x2
                navbarContent.setNavbarPos(e, 2);
            }).on('mouseout', function (e) {
                // when not hovering, set a timer to go back
                // nbarContent.timeout = setTimeout(() => nbarContent.setNavbarPos(e, 0), DELAY_UNTIL_HIDE);
            });


            reAdjustTopMargin();
            return navbarContent;
        });
    }

    function toggle_safesearch() {
        // by default, it'll toggle, but if enableSs was passed true or false, it will follow that

        console.log('safeSearch toggle');
        const ssLink = document.querySelector('#ss-bimodal-strict');
        const ussLink = document.querySelector('#ss-bimodal-default');

        if (ssLink && !ussLink) {
            console.log('sslink', ssLink.href, ssLink);
            localStorage.setItem('targetHostname', 'www.google.com'); // force normal hostname to avoid ipv4 issues
            location.assign(ssLink.href); // to safe search
        } else {// to unsafe search
            if (document.querySelector('#ss-bimodal-default') && localStorage.getItem('shouldBeUnsafesearch') === "true") { // if already attempted and shouldBeUnsafesearch
                location.assign(unsafeSearchUrl()); // force unsafesearch
            } else {
                localStorage.setItem('shouldBeUnsafesearch', "true");
                location.assign(ussLink.href);
            }
        }
    }

    function removeHash() {
        const withoutHash = location.href.split('#').slice(0, -1).join('#');
        history.pushState(null, document.title, withoutHash);
    }

})();

function addCss(cssStr, id = '') {
    cssStr = String(cssStr).replace(/\n\n/g, '\n');
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
    }).then((args) => (args));
}

function isBase64ImageData(str) {
    return /^data:image\/.{1,5};base64/.test(str);
}
function urlToAnchor(href, target = '') {
    const a = document.createElement('a');
    a.setAttribute('href', href);
    a.target = target;
    document.body.appendChild(a);
    return a;
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
    return window.URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
}

function cleanGibberish(str, minWgr, debug = false) {
    if (str) {

        // removing the phrase "Showing ____ Images for_____" that begins in the sentence
        const m = str.match(/^(Showing.*?Images for\s+)(.*)/i);
        if (m && m.length >= 3) {
            str = m[2];
        }

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

//TODO: make these functions in a utility class
/** https://stackoverflow.com/a/3579651/7771202 */
function sortByFrequency(array) {
    const frequency = {};

    for (const value of array) {
        frequency[value] = 0;
    }

    const uniques = array.filter(function (value) {
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

    let observer = {};
    const MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

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
 * @param {Object} opts
 * @param {Number=0} opts.timeout - timeout in milliseconds, how long to wait before throwing an error (default is 0, meaning no timeout (infinite))
 * @param {Element=} opts.target - element to be observed
 *
 * @returns {Promise<Element|any>} the value passed will be a single element matching the selector, or whatever the function returned
 */
function elementReady(getter, opts = {}) {
    return new Promise((resolve, reject) => {
        opts = Object.assign({
            timeout: 0,
            target: document.documentElement
        }, opts);
        const returnMultipleElements = getter instanceof Array && getter.length === 1;
        let _timeout;
        const _getter = typeof getter === 'function' ?
            (mutationRecords) => {
                try {
                    return getter(mutationRecords);
                } catch (e) {
                    return false;
                }
            } :
            () => returnMultipleElements ? document.querySelectorAll(getter[0]) : document.querySelector(getter)
        ;
        const computeResolveValue = function (mutationRecords) {
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

        if (opts.timeout)
            _timeout = setTimeout(() => {
                const error = new Error(`elementReady(${getter}) timed out at ${opts.timeout}ms`);
                reject(error);
            }, opts.timeout);


        new MutationObserver((mutationRecords, observer) => {
            const completed = computeResolveValue(_getter(mutationRecords));
            if (completed) {
                observer.disconnect();
            }
        }).observe(opts.target, {
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

function getWheelDelta(wheelEvent) {
    // cross-browser wheel delta
    wheelEvent = window.event || wheelEvent; // old IE support
    return Math.max(-1, Math.min(1, (wheelEvent.wheelDelta || -wheelEvent.detail)));
}

function clickImagesOneByOne() {
    let i = 0;
    const imgs = Array.from(document.querySelectorAll('.rg_i'));
    const interval = setInterval(function () {
        i++;
        if (i >= imgs.length) {
            clearInterval(interval);
            return;
        }
        rightClick(imgs[i]);
    }, 10);
}

function rightClick(element) {
    // found here: https://intellipaat.com/community/11740/javascript-simulate-right-click-through-code
    const evt = element.ownerDocument.createEvent('MouseEvents');
    const RIGHT_CLICK_BUTTON_CODE = 2; // the same for FF and IE
    evt.initMouseEvent('click', true, true,
        element.ownerDocument.defaultView, 1, 0, 0, 0, 0, false,
        false, false, false, RIGHT_CLICK_BUTTON_CODE, null);

    if (document.createEventObject) {
        // dispatch for IE
        return element.fireEvent('onclick', evt)
    } else {
        // dispatch for firefox + others
        return !element.dispatchEvent(evt);
    }
}

function getMetaContainers() {
    function getObjs(o) {
        return Object.values(o).filter(v => !!v && typeof (v) === 'object' && !(v instanceof Array));
    }
// const g = window['document']['gs']['__jscontroller']['o']['Hd']['ek']['byfTOb'][0]['g']['nl']['g']['g'][0]['mt']['Fp'][1]['o']['V']['nl']['g']['j'][0]['mt']['ma']['W']['nl']['g']['resize'][1]['mt']['Sb']['zc'][0]['__jscontroller']['o']['Cj']['Nk']['g'];
    try {
        // var j = document.querySelector("#NmTzue")['__jscontroller']['o']['g']['j'];
        // var val = j['V']['__jscontroller']['o']['H'][0]['Th']['__jsmodel']['jJJIob']['o']['Da']['j'][0]['j']['3'];

        var V = document.querySelector("#yDmH0d > div.T1diZc.KWE8qe > c-wiz")
            || window['document']['gs']['__jscontroller']['og']
            ['Vd']['dl']['byfTOb'][0]['g']['wm']['g']['g'][0]['sv']['mr'][1]['o']['V']['wm']['g']['j'][0]['sv']['CZ']['V']['wm']['g']['resize'][1]['sv']['ac']['Jc'][0]['__jscontroller']['og']
            ['Ck']['Ul']['g']['5']['__jscontroller']['og']
            ['j']['va']['g']['g']['wm']['g']['l'][2]['sv']['g']['0']['target']['__component']['Aa']['og']['o']['lf']['Aa']['w']['__jscontroller']['og']
            ['cu']['chrome']['V'];
        // turns out
        var Hg = document.querySelector("#islmp > div > div > div > div")
            || V['__jscontroller']['og']['H'][0]['Hg']

        var __jsmodel = Hg['__jsmodel'];
        var jJJIob = __jsmodel['jJJIob'];
        var og  = getObjs(jJJIob).pop(); // return first object value
        // all the `Ea` and 

        var metaInfos = Object.values(og).filter(v => v && v.hasOwnProperty('o') && (v.o instanceof Array )).map(
            ea => ea['o'][0].w[2]//

            /*  ea['o'][0] looks like this:

                g: {3: Array(204), 12: _.Qu, 25: Array(0)}
                Ga: undefined
                H: -1
                w: (25) ["GRID_STATE0", null, Array(204), "", "", "", 1, Array(0), null, null, null, Array(12), null, null, null, null, Array(3), "", null, null, null, null, 1, null, Array(0)]
            */
                //['g']['3']//[85]['g']['2']['g']['4']['w'][0] // => 'https://25.media.tumblr.com/8026bf09a8e515d070ff11525fa6086a/tumblr_mj3krePaWE1s7un91o1_250.gif'
        ).flat(1);

        // window['document']['gs']['__jscontroller']['og']['Vd']['dl']['byfTOb'][0]['g']['wm']['g']['g'][0]['sv']['mr'][1]['o']['V']['wm']['g']['j'][0]['sv']['CZ']['V']['wm']['g']['resize'][1]['sv']['ac']['Jc'][0]['__jscontroller']['og']['Ck']['Ul']['g']['11']['__jscontroller']['og']['g']['j']['V']['__jscontroller']['og']['V']['o']['l2bgrgmABs15hM']['g']['1']['g']['5'][0]['g']['13']['g']['3'][9]['g']['2']['g']['183836587']['g']['3']['g']['2']['g']['10']['w'][2] // => '8EFACzxVi8cG2M'

        var metaInfos2 = [];
        try {
            metaInfos2 = Object.values
            (
                Object.values
                (
                    Object.values(getObjs(V['__jscontroller']).pop()['V']['o'])
                        .filter(v => v && v['g'] && v['g']['1'] && v['g']['1']['g'])
                    // Object.values(getObjs(V['__jscontroller']).pop()['V']['o'])
                    //     [0]['g']['1']['g']
                )
                    [0][0]['g']
            ).map(e => e['g']['3'].w[1]) //[9]['g']['2']['g']['183836587']['g']['3']['g']['2']['g']['10']['w'][2] // => '8EFACzxVi8cG2M'
                .flat();

        } catch (e) {
            // console.warn(e);
        }


        return metaInfos.concat(metaInfos2);
    } catch(e) {
        // console.warn('couldn\'t get meta container from page', e);
        return [];
    }
}
/**
 * returns metas, format is a map, key: id, value: meta
 * @returns {Meta[]}
 */
function extractImageMetas() {
    function convertXvToMeta(info) { // this is turning the array to an object
        try {
            const rg_meta = {
                'id': '',  // thumbnail
                'tu': '', 'th': '', 'tw': '',  // original
                'ou': '', 'oh': '', 'ow': '',  // site and name
                'pt': '', 'st': '',  // titles
                'ity': '',
                'rh': 'IMAGE_HOST',
                'ru': 'IMAGE_SOURCE',
                'rid': '',
                'isu': '',
                's': '',
                'color': '',
            };

            const H = info;
            const imgInfo = H[1];
            rg_meta.id = H[7] || imgInfo[1]; // => 'cRIoGkXQe6VmfM'

            const imgInfoThumb = imgInfo[2];
            /*
            looks like this:
            ["https://encrypted-tbn0.gstatic.com/images?q=tbn%3AANd9GcTNqAgIdupLhB4RZURRBAnFpGi3XuQPQD8qKeiHlxPV8TBLRDVZ", 185, 272 ]
            */
            rg_meta.tu = imgInfoThumb[0]; // => 'https://encrypted-tbn0.gstatic.com/images?q=tbn%3AANd9GcTNqAgIdupLhB4RZURRBAnFpGi3XuQPQD8qKeiHlxPV8TBLRDVZ'
            rg_meta.th = imgInfoThumb[1]; // => 185
            rg_meta.tw = imgInfoThumb[2]; // => 272

            const imgInfoOriginal = imgInfo[3];
            rg_meta.ou = imgInfoOriginal[0]; // => 'https://i.makeagif.com/media/7-03-2015/GgiQvE.gif'
            rg_meta.oh = imgInfoOriginal[1]; // => 400
            rg_meta.ow = imgInfoOriginal[2]; // => 273

            const imgInfoLegacy = imgInfo.slice(-1)[0];
            rg_meta.rid = imgInfoLegacy['2003'][1]; // => ODcmttHdhuZIuM
            rg_meta.isu = imgInfoLegacy['2003'][2]; // => https://makeagif.com/gif/metroid-prime-2-echoes-100-walkthrough-part-68-annihilator-beam-GgiQvE
            rg_meta.pt = imgInfoLegacy['2003'][3] || imgInfoLegacy['2008'][1]; // => Metroid Prime 2: Echoes 100% Walkthrough Part 68 - Annihilator ...
            rg_meta.st = imgInfoLegacy['2003'][12]; // => Make A Gif
            rg_meta.rh = imgInfoLegacy['183836587'][0]; // => makeagif.com
            rg_meta.s = imgInfoLegacy['2006'] && imgInfoLegacy['2006'][8] && imgInfoLegacy['2006'][8][1]; // => "some description text here"
            rg_meta.color = imgInfo[6]; // => 'rgb(152,50,56)'


            return rg_meta;
        } catch (e) {
            console.warn('Error while collecting meta', e, info);
        }
    }

    const metas = getMetaContainers().map(convertXvToMeta).filter(meta => !!meta);

    // same as metas, but is an object with the "id" as the key
    return Object.fromEntries(metas.map(meta => [meta.id, meta]));
}

function updateImageMetas() {
    let metasMap = extractImageMetas();
    // this will set the "_meta" attribute for each of the images
    if (!Object.keys(metasMap).length) {
        console.warn('failed to parse metaData');

        try {
            metasMap = parse_AF_dataInitCallback();
        } catch (e) {
            console.error('even parse_AF_dataInitCallback failed:', e);
            return;
        }

    }

    const imgs = document.querySelectorAll(`div[data-tbnid] img.rg_i`);
    // for each image, add the meta, and return if success or failure
    const failures = [].map.call(imgs, img => {
        const div = img.closest('div[data-tbnid]');
        const id = div.getAttribute('data-tbnid');
        const meta = metasMap[id];

        if (!meta) {
            return img;
        }
        // if (img._meta) return;

        img._meta = meta;
        img.setAttribute('fullres-src', meta.ou);
        img.closest('a').href = meta.ou;
        // console.log('added meta data:', meta);
    }).filter(x => !!x);

    // if (failures.length) {
    //     console.warn('meta not found imgBoxes', failures);
    // }

    // // this will set the "_meta" attribute for each of the images
    // Object.entries(metasMap).forEach(([, meta]) => {
    //     const img = document.querySelector(`[data-tbnid="${meta['id']}"] img.rg_i`);
    //     if (!img) {
    //         console.warn('no data-tbnid found for', meta['id'])
    //         return;
    //     }
    //     // if (img._meta) return;
    //
    //     img._meta = meta;
    //
    //     img.src = meta.ou;
    //     img.setAttribute('fullres-src', meta.ou);
    //     img.closest('a').href = meta.ou;
    //     console.log('added meta data:', meta);
    // });


}

unsafeWindow.extractImageMetas = extractImageMetas;
unsafeWindow.updateImageMetas = updateImageMetas;


function parse_AF_dataInitCallback() {
    if (parse_AF_dataInitCallback.metasMap) return parse_AF_dataInitCallback.metasMap;

    var metasMap = {};
    var data = Array.from(document.querySelectorAll('script[nonce]'))
        .map(s => s.innerText)
        .filter(t => /^AF_initDataCallback/.test(t))
        .map(t => {
            try {
                // this will trim the code to choose only the part with the data arrays
                const [start, end] = ["data:function(){return ", "]\n}});"];
                const data_str = t.substring(t.indexOf(start) + start.length, t.lastIndexOf(end) + 1);
                return JSON.parse(data_str);
            } catch (e) {
                console.error(e);
                return {};
            }
        })
        .filter(d => d && d.length && d.reduce((acc, el) => acc || el && el.length))
    ;

    var entry = data.slice(-1)[0];
    if (!entry) return metasMap;
    var imgMetas = entry[31][0][12][2].map(meta => meta[1]); // confirmed
    var metas = imgMetas.map(meta => {
        try {
            const rg_meta = ({
                'id': '',  // thumbnail
                'tu': '', 'th': '', 'tw': '',  // original
                'ou': '', 'oh': '', 'ow': '',  // site and name
                'pt': '', 'st': '',  // titles
                'ity': '',
                'rh': 'IMAGE_HOST',
                'ru': 'IMAGE_SOURCE',
            });

            rg_meta.id = meta[1];
            [rg_meta.tu, rg_meta.th, rg_meta.tw] = meta[2];
            [rg_meta.ou, rg_meta.oh, rg_meta.ow] = meta[3];

            const siteAndNameInfo = meta[9] || meta[11];

            if (siteAndNameInfo[2003]) {
                rg_meta.pt = siteAndNameInfo[2003][3];
            } else {
                rg_meta.pt = siteAndNameInfo[2003][2];
            }
            rg_meta.st = siteAndNameInfo[183836587][0]; // infolink TODO: doublecheck

            return rg_meta;
        } catch (e) {
            console.warn(e);
        }
    }).filter(meta => !!meta);

    metasMap = Object.fromEntries(metas.map(meta => [meta.id, meta])); // same as metas, but is an object with the "id" as the key

    parse_AF_dataInitCallback.metasMap = metasMap;
    return metasMap;
}
