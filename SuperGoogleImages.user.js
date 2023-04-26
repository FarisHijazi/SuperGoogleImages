// ==UserScript==
// @name         Super Google Images
// @namespace    https://github.com/FarisHijazi/SuperGoogleImages
// @author       Faris Hijazi
// @version      1.2.9
// @description  Replace thumbnails with original (full resolution) images on Google images
// @description  Ability to download a zip file of all the images on the page
// @description  Open google images in page instead of new tab
// @include      /^https?://(?:www|encrypted|ipv[46])\.google\.[^/]+/(?:$|[#?]|search|webhp|imgres)/
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @grant        window.close
// @require      https://greasyfork.org/scripts/433051-trusted-types-helper/code/Trusted-Types%20Helper.user.js
// @require      https://code.jquery.com/jquery-3.4.0.min.js
// @require      https://raw.githubusercontent.com/kimmobrunfeldt/progressbar.js/master/dist/progressbar.min.js
// @require      https://raw.githubusercontent.com/Stuk/jszip/master/dist/jszip.min.js
// @require      https://github.com/ccampbell/mousetrap/raw/master/mousetrap.min.js
// @require      https://rawgit.com/notifyjs/notifyjs/master/dist/notify.js
// @require      https://github.com/FarisHijazi/ShowImages.js/raw/master/PProxy.js
// @require      https://raw.githubusercontent.com/mitchellmebane/GM_fetch/master/GM_fetch.js
// @require      https://github.com/FarisHijazi/GM_downloader/raw/master/GM_Downloader.user.js
// @require      https://github.com/FarisHijazi/ShowImages.js/raw/master/ShowImages.js
// @updateUrl    https://raw.githubusercontent.com/FarisHijazi/SuperGoogleImages/master/SuperGoogleImages.user.js
// @run-at       document-start
// @connect      *
// ==/UserScript==
console.log('SuperGoogleImages hi');

// check this:
// https://gist.github.com/bijij/58cc8cfc859331e4cf80210528a7b255/

// https://github.com/FarisHijazi/SuperGoogleImages/projects/1

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
    if (typeof unsafeWindow.SuperGoogleImages !== 'undefined')
        return;

    const SuperGoogleImages = this || {};
    unsafeWindow.SuperGoogleImages = SuperGoogleImages;
    SuperGoogleImages.$ = $;

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

    console.log('SuperGoogleImages showImages:', showImages);
    SuperGoogleImages.showImages = showImages;

    const pageUrl = new URL(location.href);

    const mousetrap = Mousetrap();
    SuperGoogleImages.mousetrap = mousetrap;

    try {
        checkImports(['ProgressBar', '$', 'JSZip'], 'SuperGoogleImages.user.js', true);
        console.debug('SuperGoogleImages running');
    } catch (error) {
        console.error(error);
    }

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
            searchModeDiv: 'div.hdtb-mitem',
            selectedSearchMode: 'div.hdtb-mitem.hdtb-msel',
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
                    '#Sva75c > div > div > div.pxAole > div:not([style*="display: none;"])', // for side panel mode
                    '#Sva75c > div > div > div.pxAole > div:not([aria-hidden=\'true\'])',
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
            },
            toolbar: {
                smallImageSliderDefaultValue: 250,
                navbarHideDelay: 700,
            },
            // these should be under "page"
            page: {
                staticNavbar: false,
                autoLoadMoreImages: false, // somewhat problematic and can be annoying
                showImgHoverPeriod: 350, // if negative, then hovering functionality is disabled
            },
            shortcuts: {
                hotkey: 'ctrlKey', // 'altKey', 'shiftKey'
            },
            loading: {
                hideFailedImagesOnLoad: false,
                useDdgProxy: true,
            },
        };

        const o = $.extend(DEFAULTS, GM_getValue('Preferences'));

        o.store = () => GM_setValue('Preferences', o);
        o.get = () => GM_getValue('Preferences');


        // write back to storage (in case the storage was empty)
        o.store();

        return o;
    })();
    unsafeWindow.Preferences = Preferences;
    Preferences.toolbar.navbarHideDelay = 700;

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
    if (localStorage.getItem('clickShowAllSizes') === 'true') {
        elementReady(Consts.Selectors.showAllSizes).then(function (el) {
            localStorage.setItem('clickShowAllSizes', '');
            return el.click();
        });
    }

    // === start of function definitions ===
    var isFirstMetaUpdate = true; // flag for meta update (first time should be free, next times should have added images)
    // called as soon as the "body" is loaded
    function onload() {
        if (GoogleUtils.isOnGoogleImages || GoogleUtils.isOnGoogleImagesPanel) {

            createStyles();
            bindKeys();

            // wait for searchbar to load
            // document.addEventListener('DOMContentLoaded', onContentLoaded);
            elementReady(Consts.Selectors.menuItemsAndButtonsContainer).then(onSearchbarLoaded);

            // onImageBatchLoaded observe new image boxes that load
            observeDocument((mutations, me) => {
                // location.href = 'google.com'
                // console.log('close()')
                // close()


                const addedImageBoxes = getImgBoxes(':not(.rg_bx_listed)');

                if (!!document.querySelector('#islmp > div > div > div > div') && isFirstMetaUpdate) {
                    var updateImageMetasRet = updateImageMetas()
                    if (updateImageMetasRet && updateImageMetasRet.filter(x=>!!x).length) {
                        isFirstMetaUpdate = false;
                    }
                }
                if (!addedImageBoxes.length) {
                    return;
                }

                if (!!document.querySelector('#islmp > div > div > div > div')) {
                    updateImageMetas();
                }

                if (shouldShowOriginals) {
                    const thumbnails = [].map.call(getThumbnails(), div => div.closest('img[fullres-src]'))
                        .filter(img => !!img);

                    showOriginals(thumbnails);
                }
                onImageBatchLoaded(addedImageBoxes);
                updateDownloadBtnText();

                // //Google direct links
                // // FIXME: this is what prevents you from opening image tabs
                // directLinkReplacer.checkNewNodes(mutations);

            }, {
                callbackMode: 0,

                childList: true,
                attributes: true,
                // attributeFilter: ['href'],
                subtree: true,
            });

        } else { // else if not google images
            if (location.pathname === '/save') {
                var imgs = document.querySelectorAll('c-wiz div > div > div > div > div > a > div > div > img');
                imgs.forEach(img => {
                    a = img.closest('a');
                    var imgurl = new URL(a.href, 'https://' + location.hostname).searchParams.get('imgurl');
                    if (imgurl) {
                        img.src = imgurl;
                    }
                });
            }

            elementReady(() => getElementsByXPath('//a[text()=\'Change to English\']')[0]).then(changeToEnglishAnchors => {
                changeToEnglishAnchors.click();
            });

        }
    }

    // called when the searchbar is loaded (used for functionality that needs elements to be loaded)
    function onSearchbarLoaded() {
        // // just deleting the Google home button (cuz it overlaps with the navbar)
        // document.querySelector('.qlS7ne').remove();

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
        if (ussLink && localStorage.getItem('shouldBeUnsafesearch') === 'true') {
            console.info('"shouldBeUnsafesearch"=true, but this is not unsafe search, forcing unsafe search using "ipv4"...');
            location.assign(unsafeSearchUrl()); // force unsafesearch
            localStorage.setItem('shouldBeUnsafesearch', '');
            return;
        }
        const targetHostname = localStorage.getItem('targetHostname');
        if (targetHostname && (targetHostname !== location.hostname)) {
            localStorage.setItem('targetHostname', '');
            location.hostname = targetHostname;
            return;
        }


        injectGoogleButtons()

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

        // S S: SafeSearch toggle
        mousetrap.bind('s s', toggle_safesearch);


        mousetrap.bind(['alt+a', 'a a'], function switchToAnimatedResults() {
            console.log('Go to animated');
            location.assign(document.querySelector('#TypeAnimated').href);
            (
                document.querySelector('#TypeAnimated') ||
                (document.querySelector('#itp_animated') && document.querySelectoooor('#itp_animated').firstElementChild) ||
                document.querySelector('#itp_').firstElementChild ||
                document.querySelector('#itp_animated').firstElementChild
            ).click();
        });
        mousetrap.bind(['D'], function downloadAll() {
            document.querySelector('#downloadBtn').click();
        });
        // mousetrap.bind(['h'], function toggle_hideFailedImages() {
        //     document.querySelector('#hideFailedImagesBox').click();
        // });
        // mousetrap.bind(['g'], function toggle_gifsOnlyCheckbox() {
        //     document.querySelector('#GIFsOnlyBox').click();
        // });
        mousetrap.bind(['esc'], removeHash);
        mousetrap.bind(['o o'], function displayOriginals() { document.querySelector('#dispOgsBtn').click() });

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

        // mousetrap.bind(['ctrl+['], siteSearch_TrimLeft);
        // mousetrap.bind(['ctrl+]'], siteSearch_TrimRight);

        // mousetrap.bind(['['], function stepDown_minImgSizeSlider(e) {
        //     Components.minImgSizeSlider.stepDown();
        // });
        // mousetrap.bind([']'], function stepUp_minImgSizeSlider(e) {
        //     Components.minImgSizeSlider.stepUp();
        // });

        // mousetrap.bind(['c'], function goToCollections(e) {
        //     const btn_ViewSaves = document.querySelector('#ab_ctls > li > a.ab_button');
        //     console.debug('btn_ViewSaves', btn_ViewSaves);
        //     if (!!btn_ViewSaves) btn_ViewSaves.click();
        // });

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
                    String(entry[1]._name || entry[1].name || entry[1]).replace(/\s/g, '') !== 'function(){_nextExpectedAction=nextAction;++_sequenceLevels[combo];_resetSequenceTimer();}')
            }

            const entries = getKeymap();
            const $table = $($.parseHTML('<table>'));

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

    // return true when there will be a change
    function processLocation() {
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

            Components.minImgSizeSlider = createElement(`<input id="minImgSizeSlider" type="range" min="0" max="3000" value="${Preferences.toolbar.smallImageSliderDefaultValue}" step="50">`);

            const sliderReading_minImgSize = createElement(`<label for="minImgSizeSlider" id="minImgSizeSliderValue">${Components.minImgSizeSlider.value}x${Components.minImgSizeSlider.value}</label>`);
            Components.minImgSizeSlider.oninput = function () {
                const self = Components.minImgSizeSlider;
                sliderReading_minImgSize.innerHTML = /*'Min Dimensions<br>' +*/ (`${self.value}x${self.value}`);

                // Highlighting images that will be downloaded
                // clearAllEffects(); // TODO: this is being called too much
                for (const img of getThumbnails(true)) {
                    const meta = getMeta(img);
                    const width = meta.ow, height = meta.oh,
                        isBigger = width >= self.value || height >= self.value;

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

            const slider_dlLimit = $('<input id="dlLimitSlider" type="range">').attr({
                'attr': 1,
                'max': 1000,
                'value': 20,
            })[0];
            const sliderReading_dlLimit = createElement(`<label id="dlLimitSliderValue">${slider_dlLimit.value}</label>`);
            slider_dlLimit.oninput = highlightSelection;
            slider_dlLimit.onchange = clearEffectsDelayed;

            const tr1 = $('<tr>')
                .append($(Components.minImgSizeSlider))
                .append(sliderReading_minImgSize)[0];

            const tr2 = $('<tr>')
                .append($(slider_dlLimit))
                .append(sliderReading_dlLimit)[0];

            //TODO: make size slider increment discretely, depending on the available dimensions of the images sliders

            // return constraintsContainer
            return $('<tb>')
                .attr('class', 'sg')
                .append(tr1)
                .append(tr2)[0];
        })();

        const satCondLabel = createElement(`<label id="satCondLabel">Images satisfying conditions: 0</label>`);

        // == creating buttons ==

        const btn_dispOgs = createGButton('dispOgsBtn', 'Display <u>o</u>riginals', function () {
            updateImageMetas()
            showOriginals();
        });

        const link_animated = createElement(`<a class="sg q qs" id="TypeAnimated" href="${location.pathname + location.search + '&tbs=itp:animated'}"><u>A</u>nimated</a>`);

        const btn_preload = createGButton('preloadBtn', 'Preload images ↻', function () {
            const imgs = Array.from(document.querySelectorAll('a[href] img.rg_i'));
            const progressSpan = btn_preload.querySelector('span.preload-progress');
            let counter = 0;
            progressSpan.innerText = `(${counter}/${imgs.length})`;
            Promise.all(Array.from(imgs).map(img => ShowImages.loadPromise(img, [img.src || img.getAttribute('data-src')]).then(res => {
                progressSpan.innerText = `(${++counter}/${imgs.length})`;
            }))).then(res => {
                console.log('YAAA!!! preloaded all these images:', imgs)
            });
        });
        btn_preload.appendChild(createElement('<span class="preload-progress" style="margin: 5px;">'));

        const btn_downloadJson = createGButton('dlJsonBtn', 'Download JSON {}', downloadJSON);
        const btn_hideNavbar = createGButton('hideNavbarBtn', 'X', function () {
            elementReady('#navbar-content').then((navbarContent) => {
                navbarContent.style.display = 'none';
                document.querySelector('#showNavbarBtn').style.display = '';
            });
        });
        const btn_showNavbar = createGButton('showNavbarBtn', 'Show navbar', function () {
            elementReady('#navbar-content').then((navbarContent) => {
                navbarContent.style.display = '';
                document.querySelector('#showNavbarBtn').style.display = 'none';
            });
        });
        btn_showNavbar.style.display = 'none';
        btn_showNavbar.style.margin = '0px';
        // const btn_trimSiteLeft = createGButton('trimSiteLeft', '[', siteSearch_TrimLeft);
        const btn_showKeymap = createGButton('showKeymap', '(?) keymap', toggleShowKeymap);
        const btn_download = $(createGButton('downloadBtn', 'Download EVERYTHING ⬇️', downloadImages)).css({
            'margin': '20px',
            'border': '20px',
        }).text(cbox_ZIP.checked ? 'ZIP&nbsp;images' : `⬇️&nbsp;Download`)[0];

        const downloadPanel = createElement('<div id="download-panel" style="display: block;"></div>');

        // Appending buttons to downloadPanel
        for (const el of [cbox_ZIP, cbox_closeAfterDownload, btn_download, btn_downloadJson, constraintsContainer]) {
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
        divider.after(btn_hideNavbar, btn_dispOgs, cbox_ShowFailedImages, cbox_GIFsOnly, cbox_UseDdgProxy, cbox_GIFsException, cbox_OnlyShowQualifiedImages, link_animated, searchEngineSelect, pathBox, btn_showKeymap, downloadPanel,);

        constraintsContainer.append(satCondLabel);
        downloadPanel.appendChild(createElement(`<div id="progressbar-container"></div>`));

        // disable buttons
        [cbox_ShowFailedImages, cbox_GIFsOnly, pathBox, cbox_UseDdgProxy, cbox_GIFsException, cbox_OnlyShowQualifiedImages, constraintsContainer].forEach(el=>{
            el.style.display = 'none';
        });

        return createAndGetNavbar().then(function (navbarContentDiv) {
            // const gNavbar = document.querySelector('#rshdr, header > div:nth-child(1)');
            // navbarContentDiv.before(gNavbar, document.querySelector('#searchform'));
            navbarContentDiv.before(btn_showNavbar);
            navbarContentDiv.appendChild(controlsContainer);
            // .after(createElement('<div><img src="'+UPARROW_GIF+'" style="height: 20px"></div>'));
            navbarContentDiv.after(document.querySelector('#navbar-hover-sensor'));
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

        // replace any thumbnails
        document.querySelectorAll('[fullres-src]').forEach(a=>{
            if (a.getAttribute('loaded') === 'true' && a.src.startsWith('https://encrypted-tbn0.gstatic.com/images'))
                a.src = a.getAttribute('fullres-src')
        });

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
        const qualifiedGImgs = document.querySelectorAll('img.rg_i:not([loaded="error"])');
        if (zipBox && zipBox.checked) {
            if (!zip || Object.keys(zip.files).length < 1) {
                gZipImages();
            } else {
                if (zip) zip.genZip();
            }
        } else {
            let i = 0;
            const btns = [].map.call(qualifiedGImgs, img => img.parentElement.querySelector('.download-block'));
            const interval = setInterval(function () {
                btns[i++].click();
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

                // sometimes it still looks like this:
                // https://www.google.com/imgres?imgurl=https%3A%2F%2Fi2.wp.com%2F38.media.tumblr.com%2F0f811424d67789d2efc270c91e9f1842%2Ftumblr_n71600tZE01tbboovo1_500.gif&imgrefurl=https%3A%2F%2Fdatawav.club%2Fcrazy-eyes-blowjob-pov%2F&tbnid=lAqAlQWCj5mfhM&vet=10CJQBEDMokwFqFwoTCODy0dOD2vgCFQAAAAAdAAAAABAC..i&docid=1a_ZXKdl38h1XM&w=500&h=477&q=site%3Ahttps%3A%2F%2Fdatawav.club%2F%20blowjob&hl=en&ved=0CJQBEDMokwFqFwoTCODy0dOD2vgCFQAAAAAdAAAAABAC
                function replaceImg() {
                    var anchor = imgBx.img.closest('a');
                    directLinkReplacer.checkNewNodes({target: anchor});
                    showImages.replaceImgSrc(imgBx.img, anchor);
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
                // imgBx.addEventListener('mouseout', () => clearTimeout(timeout)); // this has performance issues
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

            const img = imgBox.querySelector('img.rg_i, img.irc_rii, img');
            const link = img.closest('a');

            const downloadImage = function (e = {}) {
                var img = this.previousElementSibling;
                console.log('downloadImage', e, img);
                const meta = getMeta(img);
                const src = img.getAttribute('loaded') === 'true' ? img.src : img.getAttribute('fullres-src') || meta.ou || 'META.OU IS UNDEFINED!';
                const fileName = (unionTitleAndDescr(meta.s, unionTitleAndDescr(meta.pt, meta.st)) + meta.ity);

                download(src, fileName, {fileExtension: meta.ity});
                e.preventDefault();
                e.stopImmediatePropagation();
                e.stopPropagation();
            };

            const $dlBtn = $('<div class="text-block download-block""></div>').css({
                'background-color': 'dodgerblue',
                'margin-left': '35px',
            }).text('⬇️').click(downloadImage);

            link.addEventListener('click', function (e) {
                if (e[Preferences.shortcuts.hotkey]) {
                    downloadImage(e); // it already prevents default and stops propagation
                }
            });

            img.after($dlBtn[0]);
            $dlBtn[0].addEventListener('click', function (e) {
                downloadImage(e);
            });
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

        addedImageBoxes.forEach(enhanceImageBox);

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
        // if the div was passed, get the img
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

        if (!img) {
            return metaObj;
        }

        // if img._meta already exists (and isn't empty)
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
            // metaObj.pt = metaObj.pt || img.closest('a').nextElementSibling.querySelector('div > div').innerText;
            // metaObj.st = metaObj.st || img.closest('a').nextElementSibling.querySelector('div > div span').innerText;

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

            return;
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
            const SELECTOR_BLACKLIST = [
                "#islsp",
            ];
            const target = mutation.target;
            for (const selector of SELECTOR_BLACKLIST) {
                if (target.matches(selector)) {
                    console.debug('element matched blacklist selector:', selector, target);
                    return;
                }
            }

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
                (!downloadBtn.classList.contains('genzip-possible') ? 'ZIP' : '⬇️&nbsp;Download&nbsp;ZIP') : // "zip" or "download zip"
                '⬇️&nbsp;Download';
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

    /**
     * @return an object map of menuItem name as the key, and HTMLDivElement as value
     * {key: menuItemName, value: menuItem HTMLDivElement}
     * menuItemNames = [ "all", "images", "videos", "news", "maps", "more" ]
     */
    function getMenuItems() {
        const menuItems = document.querySelectorAll("#top_nav .hdtb-mitem a");
        let menuItemsObj = {};

        for (const menuItem of menuItems) {
            menuItemsObj[menuItem.innerText] = menuItem;
        }

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
        addCss(`/*sg=SuperGoogleImages, this is padding for the buttons and controls*/
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

            /*coloring links, make them easier to see*/
            .mblink:visited, a:visited {
                color: #d684ff;
            }

            a:link, .w, #prs a:visited, #prs a:active, .q:active, .q:visited, .kl:active, .tbotu {
                color: #988fff;
            }
        `, 'panel');

    }


    /**
     * Creates a static navbar at the top of the page.
     * Useful for adding buttons and controls to it
     *  do NOT just take the returned value and start adding elements.
     *  @return {Promise<Element | any>} returns the parent navbar element
     */
    function createAndGetNavbar() {
        // Settings up the navbar
        /*for moving the footcnt bar at the bottom more to the bottom*/
        // language=CSS
        addCss(`
            div#navbar {
                position: fixed;
                z-index: 5;
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


        const $navbarContent = $('<div id="navbar-content" style="width: 50%"></div>');
        // this will be added later
        const $navbar = $('<div id="navbar"></div>').append($navbarContent).append($('<div id="navbar-hover-sensor" style="height: 30px; display: none;"></div>'));
        const nbarContent = $navbarContent[0];

        // adding some handy functions
        /**
         * @param e
         * @param pos - 0 is hide, 1 is show
         * @param hidelater - hide now or later, default: false
         */
        nbarContent.setNavbarPos = function (e, pos = 0, hidelater = false) {
            return;
            clearTimeout(nbarContent.timeout);
            if (hidelater && pos !== 0) {
                nbarContent.timeout = setTimeout(() => nbarContent.setNavbarPos(e, 0), Preferences.toolbar.navbarHideDelay);
            }
            const googleControlsContainer = document.querySelector('#google-controls-container');
            nbarContent.style.top = `${(pos - 1) * googleControlsContainer.clientHeight}px`;
            nbarContent.pos = pos;

        };

        // make physical div to push elements down
        const $physicalDiv = $('<div id="navbar-phys" style="position:relative;display:table;height:50px;">'); // this div pushes all the bellow content (so the navbar won't cover it)
        $navbar.after($physicalDiv);

        const searchform = document.querySelector('#searchform, [role="search"]');
        const rshdr = document.querySelector('#rshdr, header > div:nth-child(1), c-wiz > div') || searchform.previousElementSibling;


        rshdr.append($navbar[0], searchform);

        function reAdjustTopMargin(e) { // moves the rest of the page down a bit so it won't be covered by the navbar
            nbarContent.timeout = setTimeout(() => nbarContent.setNavbarPos(e, 0, true), Preferences.toolbar.navbarHideDelay);
            // return;

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
                    navbarContent.setNavbarPos(e, 1, true);
                }
            };

            // bind to main images container
            elementReady('#isr_mc').then(function (mainImagesContainer) {
                mainImagesContainer.addEventListener('wheel', onscrollAutoHideNavbar);
            });

            // sidepanel scroll handler
            // hide navbar when using sidebar
            elementReady(Consts.Selectors.sidepanelScrollEl).then(function (sidepanelScrollEl) {
                sidepanelScrollEl.addEventListener('wheel', function (e) {
                    console.debug('sidepanelScrollEl wheel event. Hiding navbar')
                    navbarContent.setNavbarPos(e, 0);
                });
            });


            // when hovering over the google toolbars, move the navbar down
            $([navbarHoverSensor]).on('mouseover mousemove', function (e) {
                var directionX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
                var directionY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
                // console.log('directionX, directionY', directionX, directionY)

                // // if mouse moving up: show
                // if (directionY < 0) {
                //     navbarContent.setNavbarPos(e, 1);
                // }
                // if mouse moving down: hide
                if (directionY > 0) {
                    console.debug('mouse moving down on navbar sensor:', 'hiding navbar')
                    navbarContent.setNavbarPos(e, 0);
                } else if (navbarContent.pos <= 1) { // moveNavbarDown
                    navbarContent.setNavbarPos(e, 1);
                }
            }).on('mouseout', function (e) {
                // when not hovering, set a timer to go back
                // nbarContent.timeout = setTimeout(() => nbarContent.setNavbarPos(e, 0), Preferences.toolbar.navbarHideDelay);
            });

            // when hovering over the google toolbars, move the navbar down
            $([navbarContent, navbarHoverSensor]).on('mouseover mousemove', function (e) {
                var directionX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
                var directionY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
                // console.log('directionX, directionY', directionX, directionY)

                // // if mouse moving up: show
                // if (directionY < 0) {
                //     navbarContent.setNavbarPos(e, 1);
                // }
                // if mouse moving down: hide
                if (directionY > 0) {
                    // console.debug('mouse moving down on navbar sensor:', 'hiding navbar')
                    // navbarContent.setNavbarPos(e, 0);
                } else if (navbarContent.pos <= 1) { // moveNavbarDown
                    navbarContent.setNavbarPos(e, 1);
                }
            }).on('mouseout', function (e) {
                // when not hovering, set a timer to go back
                // console.info('when not hovering, set a timer to go back')
                // nbarContent.timeout = setTimeout(() => {
                //     nbarContent.setNavbarPos(e, 0);
                //     console.info('going back cuz: "when not hovering, set a timer to go back"')
                // }, Preferences.toolbar.navbarHideDelay);
            });

            $('#navbar').on('wheel scroll scrollwheel', (e) => {
                console.log('navbar: onscroll:', e);
                onscrollAutoHideNavbar(e);
            });

            // bind listeners to these elements, for showing and hiding the navbar when scrolled to top
            // when hovering over the google toolbars, move the navbar down
            // FIXME: ('#top_nav, #sfcnt, #searchform') these elements don't exist or selectors have changed
            $('#top_nav, #sfcnt, #searchform, [role="search"]').on('mouseover mousemove', function (e) {
                console.debug('show navbar x2');
                navbarContent.setNavbarPos(e, 2);
            }).on('mouseout', function (e) {
                // when not hovering, set a timer to go back
                nbarContent.timeout = setTimeout(() => nbarContent.setNavbarPos(e, 0), Preferences.toolbar.navbarHideDelay);
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
            if (document.querySelector('#ss-bimodal-default') && localStorage.getItem('shouldBeUnsafesearch') === 'true') { // if already attempted and shouldBeUnsafesearch
                location.assign(unsafeSearchUrl()); // force unsafesearch
            } else {
                localStorage.setItem('shouldBeUnsafesearch', 'true');
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
    try {
        return new URL(href).hostname;
    } catch (e) {
        const a = document.createElement('a');
        a.href = href;
        return a.hostname;
    }

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

// we have too many observer callbacks
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
 * @returns {Promise<Element>} the value passed will be a single element matching the selector, or whatever the function returned
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

unsafeWindow.clickImagesOneByOne = clickImagesOneByOne;

// concludsion: this works, but has the issue of links being not direct (has /imgres?imgurl=IMGURL)
function clickImagesOneByOne(intervalMs=50) {
    let i = 0;
    const imgs = [].filter.call(document.querySelectorAll('.rg_i'), img=>img.closest('a:not([href])'));
    console.log('imgs', imgs.length, 'should take:', imgs.length * intervalMs / 1000, 'seconds');
    const interval = setInterval(function () {
        i++;
        if (i >= imgs.length) {
            clearInterval(interval);
            return;
        }
        directLinkReplacer.checkNewNodes(imgs[i]);
        // rightClick(imgs[i]); // doesn't work
        showOriginals([imgs[i]]);

    }, intervalMs);
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
        return element.fireEvent('onclick', evt);
    } else {
        // dispatch for firefox + others
        return !element.dispatchEvent(evt);
    }
}


//https://codereview.stackexchange.com/questions/173978/javascript-of-property-path-in-object
function findObject(root, predicate) {
    const discoveredObjects = [];
    const results = [];
  
    if (typeof predicate !== "function") {
      throw new TypeError("Predicate is not a function");
    }
  
    const queue = [{ obj: root, path: [] }];
  
    while (queue.length > 0) {
      const { obj, path } = queue.shift();
  
      for (const key of Object.keys(obj)) {
        const newPath = path.concat(key);
  
        if (predicate(key, obj) === true) {
          results.push({ value: obj[key], path: newPath });
        }
  
        const o = obj[key];
  
        if (o && typeof o === "object" && !Array.isArray(o)) {
          if (!discoveredObjects.find(obj => obj === o)) {
            discoveredObjects.push(o);
            queue.push({ obj: o, path: newPath });
          }
        }
      }
    }
  
    return results;
  }


function getObjs(o) {
    return Object.values(o).filter(v => !!v && typeof (v) === 'object' && !(v instanceof Array));
}


var infoKey = null;
var metaInfosObj = null;
function getMetaContainers() {
    try {
        // document.querySelector("#yDmH0d > div.T1diZc.KWE8qe > c-wiz")
        // document.querySelector('form[action="/search"][role="search"]#sf'); // this is the form at the top
        //         metaInfosObj = findObject(document.querySelector("#islmp > div > div > div").__jsmodel, (key, obj)=>{

        metaInfosObj = findObject(document.querySelector("#yDmH0d > div.T1diZc.KWE8qe > c-wiz").__jscontroller, (key, obj)=>{
            try {
                return !!(obj[key][2][0].length===22);
            } catch(e) {
            }
        });
        metaInfosObj = [].concat.apply([], metaInfosObj.map(o=>o[2]));
        return metaInfosObj;
    } catch (e) {
        // console.warn('couldn\'t get meta container from page', e);
        return [];
    }
}
/**
 * returns metas, format is a map, key: id, value: meta
 * WARNING: VERY expensive function to call
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

            if (!imgInfo) {
                return undefined;
            }
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

            try {
                rg_meta.rh = imgInfoLegacy[183836587][0];
            } catch (error) {
                try {
                    rg_meta.rh = imgInfoLegacy[2003][2];
                } catch (error) {
                }
            }

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

/**
 * @param {} metasMap (optional): pass it to avoid extractImageMetas()
 * @returns
 */
function updateImageMetas(metasMap) {
    if (!metasMap) {
        metasMap = extractImageMetas();
    }
    // this will set the "_meta" attribute for each of the images
    if (!Object.keys(metasMap).length) {
        // console.warn('failed to parse metaData');

        try {
            metasMap = parse_AF_initDataCallback();
        } catch (e) {
            console.error('even parse_AF_initDataCallback failed:', e);
            return;
        }

    }

    const imgs = document.querySelectorAll(`div[data-tbnid] img.rg_i`);
    // for each image, add the meta, and return if success or failure
    const successes = [].map.call(imgs, img => {
        const div = img.closest('div[data-tbnid]');
        const id = div.getAttribute('data-tbnid');
        const meta = metasMap[id];

        if (!meta) {
            // console.warn('image failed, has no meta', img);
            return;
        }
        // if (img._meta) return;

        img._meta = meta;
        img.setAttribute('fullres-src', meta.ou);
        img.closest('a').href = meta.ou;
        // console.log('added meta data:', meta);
        return img;
    });

    return successes;
}

unsafeWindow.extractImageMetas = extractImageMetas;
unsafeWindow.updateImageMetas = updateImageMetas;


function parse_AF_initDataCallback() {
    if (parse_AF_initDataCallback.metasMap) return parse_AF_initDataCallback.metasMap;


    var metasMap = {};
    var data = Array.from(document.querySelectorAll('script[nonce]'))
        .map(s => s.innerText)
        .filter(t => /^AF_initDataCallback/.test(t))
        .map(t => eval(t.replace(/^AF_initDataCallback/, '')).data)
        .filter(d => d && d.length && d.reduce((acc, el) => acc || el && el.length))
    ;

    var entry = data.slice(-1)[0];
    if (!entry) return metasMap;
    try {
        var imgMetas = entry[31][0][12][2].map(meta => meta[1]); // confirmed
    } catch (error) {
        // var imgMetas = entry[56][1][0][0][1][0].map(x => x[0][0]['444383007'][1]);
        try {
            var imgMetas = entry[56][1][0][0][1][0].map(x => Object.values(x[0][0])[0][1]);
        } catch (error2) {
            var imgMetas = entry[56][1][0].pop()[1][0].map(x => Object.values(x[0][0])[0][1]);
        }
    }

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

            try {
                const siteAndNameInfo = meta[9] || meta[11] || meta[23];
                if (siteAndNameInfo[2003]) {
                    rg_meta.pt = siteAndNameInfo[2003][3];
                } else {
                    rg_meta.pt = siteAndNameInfo[2003][2];
                }

                try {
                    rg_meta.st = siteAndNameInfo[183836587][0]; // infolink TODO: doublecheck
                } catch (error) {
                    try {
                        rg_meta.st = siteAndNameInfo[2003][2]; // infolink TODO: doublecheck
                    } catch (error) {
                    }
                }
            } catch (error) {
                console.warn(error);
            }

            return rg_meta;
        } catch (e) {
            console.warn(e);
        }
    }).filter(meta => !!meta);

    metasMap = Object.fromEntries(metas.map(meta => [meta.id, meta])); // same as metas, but is an object with the "id" as the key

    parse_AF_initDataCallback.metasMap = metasMap;
    return metasMap;
}

function hideNonGIFs() {
    document.querySelectorAll('img.rg_i').forEach(img=>{
        var div = img.closest('div[data-ved]');
        if (div.querySelector('[aria-label="Click to view animated GIF"]')) {
            console.log(div)
        } else {
            div.style.display='none'
        }
    });
}
