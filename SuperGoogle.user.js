// ==UserScript==
// @name         Super Google Images
// @namespace    https://github.com/buzamahmooza
// @version      0.3.2
// @description  Replace thumbnails with original (full resolution) images on Google images
// @description  Ability to downlaod a zip file of all the images on the page
// @description  Open google images in page instead of new tab
// @author       Faris Hijazi
// @include      /https?://(www|encrypted)\.google\..*/
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @require      http://code.jquery.com/jquery-latest.min.js
// @require      https://raw.githubusercontent.com/kimmobrunfeldt/progressbar.js/master/dist/progressbar.min.js
// @require      https://raw.githubusercontent.com/Stuk/jszip/master/dist/jszip.min.js
// @require      https://greasyfork.org/scripts/14150-google-%E7%BB%95%E8%BF%87%E6%90%9C%E7%B4%A2%E7%BB%93%E6%9E%9C%E7%BD%91%E9%A1%B5%E9%93%BE%E6%8E%A5%E9%87%8D%E5%AE%9A%E5%90%91/code/Google%EF%BC%9A%E7%BB%95%E8%BF%87%E6%90%9C%E7%B4%A2%E7%BB%93%E6%9E%9C%E7%BD%91%E9%A1%B5%E9%93%BE%E6%8E%A5%E9%87%8D%E5%AE%9A%E5%90%91.user.js
// @require      https://greasyfork.org/scripts/19210-google-direct-links-for-pages-and-images/code/Google:%20Direct%20Links%20for%20Pages%20and%20Images.user.js
// @require      https://github.com/buzamahmooza/Helpful-Web-Userscripts/raw/master/Handy%20AF%20functions%20Faris.user.js
// @run-at       document-idle
// @connect      *
// ==/UserScript==

// @require      https://github.com/buzamahmooza/Helpful-Web-Userscripts/raw/master/Handy%20AF%20functions%20Faris.user.js
// @require      https://greasyfork.org/scripts/38996-faris-handy-webdev-javascript-functions/code/Faris%20Handy%20Webdev%20JavaScript%20functions.user.js


// todo: replace this with importing GM_dummy_functions, and importing a pollyfill
if (typeof GM === 'undefined') {// PRE GM4
    GM = {};
    GM.getValue = GM_getValue;
    GM.setValue = GM_setValue;
}
if (typeof unsafeWindow === 'undefined') unsafeWindow = window;
// prevents duplicate instances
if (typeof unsafeWindow.superGoogleScript === 'undefined') {
    unsafeWindow.superGoogleScript = this;
} else {
    void (0);
}

checkImports(['ProgressBar', '$', 'JSZip'], 'SuperGoogle.user.js', true);
console.debug('SuperGoogle running');

const Consts = {
    GMValues: {
        UBL_SITES: 'unblocked sites of og images',
        UBL_URLS: 'unblocked image URLs',
        UBL_SITES_MAP: 'UBL sites map',
        hideFailedImagesOnLoad: 'HIDE_FAILED_IMAGES_ON_LOAD'
    },
    Selectors: {
        /** The "All sizes" link from the SearchByImage page*/
        showAllSizes: '#jHnbRc > div.O1id0e > span:nth-child(2) > a',
        searchModeDiv: 'div#hdtb-msb-vis',
        selectedSearchMode: 'div#hdtb-msb-vis' + ' div.hdtb-msel',
        /** the panel element containing the current image [data-ved], so if you observe this element, you can get pretty much get all the data you want.*/
        currentImagePanel: 'a#irc_cb',
        searchBox: 'input[type="text"][title="Search"]'
    },
    ClassNames: {
        DISPLAY_ORIGINAL: 'display-original-' + 'mainThumbnail',
        DISPLAY_ORIGINAL_GIF: 'display-original-' + '-gif',
        FAILED: 'display-original-' + '-failed',
        FAILED_DDG: 'display-original-' + '-ddg-failed',

        BUTTONS: 'super-button',
        belowDiv: 'below-st-div'
    }
};

// done: make the preferences object be written to the storage, rather than having each element stored, also extend a default object
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
    useDdgProxy: true
}, GM_getValue('Preferences'));

// write back to storage (in case the storage was empty)
GM_setValue('Preferences', Preferences);


var googleBaseURL = location.protocol + '//' + location.hostname;
var gImgSearchURL = googleBaseURL + '/search?&hl=en&tbm=isch&q=';

// GM_setValue(Constants.GMValues.UBL_SITES, "");
// GM_setValue(Constants.GMValues.UBL_URLS, "");
// GM_setValue(Constants.GMValues.UBL_SITES_MAP, "");

const ublSitesSet = new Set(),
    ublMetas = new Set();

/** Contains the ubl data of a single domain name */
class UBLdata {
    constructor(href, successful, dataObj) {
        const url = new URL(href);
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
            if (isDdgUrl(url)) {
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
    return zip.file('index.html', new Blob([html], { type: 'text/plain' }));
};

var slider_dlLimit;
var slider_minImgSize;
var controlsContainerId = 'google-controls-container';
var progressBar;
var searchModeDiv = q('#hdtb-msb-vis');
var selectedSearchMode = !searchModeDiv ? null : searchModeDiv.querySelector('div.hdtb-msel');
var onGoogleImages = selectedSearchMode && selectedSearchMode.innerHTML === 'Images';
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
    static wrapPanels() {

        var iio = this.initialItemObjectList;

        for (const container of this.containers) {
            this.removeClickListeners(container);
        }

        var i = 0;
        for (const container of this.containers) {
            if (container.querySelector(['.str-tag-card-images-holder', 'a.wrapper-anchor', 'a.mod-anchor'].join(', '))) {
                console.warn('element will not be wrapped by anchor:', container);
                continue;
            }
            // main card
            this.slipAnchorUnderElement(container.querySelector('div.str-wide-card-text-holder'), iio[i].realUrl);

            // title div
            // this.slipAnchorUnderElement(container.querySelector('div.str-wide-card-title'), iio[i].url);

            // img container
            this.slipAnchorUnderElement(container.querySelector('div.str-wide-card-image-holder'), iio[i].imageUrl);

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
    static slipAnchorUnderElement(element, href) {
        var tempInnerHTML = element.innerHTML;
        element.innerHTML = '';
        element.appendChild(createElement(`<a class="mod-anchor" target="_blank" href="${href}">${tempInnerHTML}</a>`));
    }
    static toDirectUrls(mutationTarget) {
        console.log('GSaves.toDirectUrls();');
        for (const a of mutationTarget.querySelectorAll('a.Uc6dJc')) {
            const usp = new URL(a.href, location.href).searchParams;
            if (usp.get('imgrefurl'))
                a.href = usp.get('imgrefurl');
        }
    }
    static get directUrls() {
        return Array.from(document.querySelectorAll('a.Uc6dJc')).map(a => new URL(a.href, location.href).searchParams.get('imgrefurl'))
    }
    static get jsonSummary() {
        return Array.from(document.querySelectorAll('a.Uc6dJc')).map(a =>
            ({
                'title': a.getAttribute('aria-label'),
                'href': a.getAttribute('href'),
                'site': a.querySelector('.SQJAwb').innerText,
                'thumbnail': a.querySelector('.DgJKRc').style['background-image'].slice(5, -2)
            })
        )
    }

    static downloadJson() {
        const json = JSON.stringify(Array.from(document.querySelectorAll('a.Uc6dJc')).map(a =>
            ({
                'title': a.getAttribute('aria-label'),
                'href': a.getAttribute('href'),
                'site': a.querySelector('.SQJAwb').innerText,
                'thumbnail': a.querySelector('.DgJKRc').style['background-image'].slice(5, -2)
            })
        ), null, 4)
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
 img[loaded="false"] {
 opacity: 0.5;
 filter: alpha(opacity=50); /!* For IE8 and earlier *!/
 }

 img[loaded="true"] {
 opacity: 1;
 filter: alpha(opacity=100); /!* For IE8 and earlier *!/
 }`);*/

// URL args: Modifying the URL and adding arguments, such as specifying the size
if (Preferences.customUrlArgs && Object.keys(Preferences.customUrlArgs).length) {
    const url = new URL(location.href),
        searchParams = url.searchParams;

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
    window.addEventListener('keydown', function keyDown(e) {
        const k = (window.event) ? e.keyCode : e.which;
        const modKeys = getModKeys(e);
        switch (k) {
            case KeyEvent.DOM_VK_GRAVE_ACCENT: // `
                if (modKeys.NONE) {
                    console.log('wrapGSavesPanelsWithAnchors');
                    GSaves.wrapPanels();
                }
                break;
        }
    });

    if (false) {
        observeAllFrames(function (mutationTarget) {
            console.log('mutationTarget:', mutationTarget);
            if (mutationTarget.querySelector('.str-clip-card-space')) {
                console.log('mutationTarget invoked wrapGSavesPanelsWithAnchors()');
                GSaves.wrapPanels();
            }
        });
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
            missing.append(importName);
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
    thisZip.file('index (online).html', new Blob([getIndexHtml()], { type: 'text/plain' }));
    thisZip.generateIndexHtml();
    thisZip.generateAsync({ type: 'blob' }).then(function (content) {
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
 * https://rarbgprx.org/download.php?id= kmvf126 &f= <TorrentName>-[rarbg.to].torrent
 */
function extractRarbgTorrentURL(torrentName, torrentPageURL) {
    const torrentURL = torrentPageURL.replace(/torrent\//i, 'download.php?id=') + '&f=' + torrentName.split(/\s+/)[0].torrent;
    console.debug('extracted rarbg torrent URL:', torrentURL);
    return torrentURL;
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

    /** @return {HTMLDivElement} */
    static get mainPanelEl() {
        return q('div#irc_cc');
    }
    /** @return {ImagePanel} returns the panel that is currently in focus (there are 3 panels) */
    static get focP() {
        return this.mainPanelEl ? new ImagePanel(this.mainPanelEl.querySelector('div.irc_c[style*="translate3d(0px, 0px, 0px)"]')) : console.warn('MainPanel not found!');
        // return this.mainPanelEl ? new IP(this.mainPanelEl.querySelector('div.immersive-container')) : console.warn('MainPanel not found!');
    }
    static get noPanelWasOpened() {
        return q('#irc_cb').getAttribute('data-ved') == null;
    }
    static get panelCurrentlyOpen() {
        return q('#irc_bg').style.display !== 'none';
    }
    /**
     @return {
     { clt: string, id: string,
                 isu: string, itg: string, ity: string,
                 oh: string, ou: string, ow: string,
                 pt: string,
                 rid: string, rmt: string, rt: string, ru: string,
                 s: string, st: string,
                 th: string, tu: string, tw
                 }
                 }
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

        descr.innerText = (descr.innerText.length < 2) ? this.pTitle_Text : descr.innerText;
        return cleanGibberish(descr.innerText);
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
    /** @return {NodeListOf<HTMLDivElement>} returns only the last related image div from `ris_Divs()`*/
    get ris_DivLast() {
        var c = this.ris_Divs;
        c = c && Array.from(c);
        return c && c.pop();
    }
    /** @return {NodeListOf<HTMLDivElement>} returns all related image divs (including the "VIEW MORE" div)*/
    get ris_DivsAll() {
        var c = this.ris_Container;
        if (c) return Array.from(c.querySelectorAll('div.irc_rimask'));
    }
    /** @return {NodeListOf<HTMLDivElement>} returns only related image divs (excluding the "VIEW MORE" div)*/
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
        const buttonsContaier = this.q('.irc_but_r > tbody > tr');
        const buttons = this.qa('.irc_but_r > tbody > tr a:first-child');

        buttons.Visit = buttonsContaier.querySelector('a.i3599.irc_vpl.irc_lth');
        buttons.Save = buttonsContaier.querySelector('a.i15087');
        buttons.ViewSaved = buttonsContaier.querySelector('a.i18192.r-iXoO2jjyyEGY');
        buttons.Share = buttonsContaier.querySelector('a.i17628');

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
            `sTitle: ${sTitle}
pTitle: ${pTitle}
description: ${description}
unionPTitleAndDescrAndSTitle: ${unionPTitleAndDescrAndSTitle}`
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
            const imgURL = this.mainImage.src || risFcDiv.querySelector('a').href;
            const reverseSearchURL = getGImgReverseSearchURL(imgURL),
                url = new URL(reverseSearchURL);
            url.searchParams.append('allsizes', '1');
            reverseImgSearchUrl = url.toString();
        }
        return reverseImgSearchUrl;
    }

    /**Goes to the previous (Left) main mainImage*/
    static previousImage() {
        const previousImageArrow = q('a[id^="irc-la"]');  // id that starts with "irc-la"
        var x = previousImageArrow.style.display !== 'none' ? // is it there?
            !previousImageArrow.click() : // returns true
            false;
        if (!x) console.log('prev arrow doesn\'t exist');
        return x;
    }
    /**Goes to the next (Right) main mainImage*/
    static nextImage() {
        const nextImageArrow = q('a[id^="irc-ra"]');  // id that starts with "irc-ra"
        var x = nextImageArrow.style.display !== 'none' ? // is it there?
            !nextImageArrow.click() : // returns true
            false;
        if (!x) console.log('next arrow doesn\'t exist');
        return x;
    }

    static modifyP(panelEl) {
        console.debug('Modifying panelEl:', panelEl);
        let p = new ImagePanel(panelEl);

        const classList = p.rightPart.classList;
        if (!classList.contains('scroll-nav')) {
            classList.add('scroll-nav');
        }

        /// Consts.ClassNames.belowDivClassName
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

        // remove "Images may be subject to copyright"
        p.sTitle_Anchor.style = 'padding-right: 5px; text-decoration:none;';
        const copyrightEl = p.q('span.Af3fH.rn92ee');
        if (copyrightEl) copyrightEl.remove();

        // injecting rarbg torrent link button
        (function injectRarbgButton() {
            const rarbg_tl = createElement(`<a class="_r3 hover-click o5rIVb torrent-link"
   style=" float: left; padding: 4px; display: inline-block; font-size: 10px; color: white;">
    <img src="https://dyncdn.me/static/20/img/16x16/download.png" alt="Rarbg torrent link" border="0"
         style=" width: 25px; height: 25px; ">
    <label style=" display: list-item; ">Torrent link</label></a>`);
            rarbg_tl.onclick = () => {
                if (/\/torrent\/|rarbg/i.test(p.pTitle_Anchor.href))
                    anchorClick(extractRarbgTorrentURL(p.pTitle_Anchor.innerText, p.pTitle_Anchor.href), '_blank');
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

        // Underlining binded keys
        /* var keymap = new Map([ // Key: selector, Value: character
         ['.i15087', 's'],
         ['.i18192', 'v']
         ]);
         for (const [selector, char] of keymap) {
         var bindEl = q(selector);
         if (!bindEl) continue;
         bindEl.outerHTML = bindEl.outerHTML.replace(new RegExp(char, 'i'), `<u>${char}</u>`);
         }*/

        // relocating the image dimensions element
        var imgDimEl = p.q('.rn92ee.irc_msc');
        if (!!imgDimEl) {
            p.sTitle_Anchor.after(imgDimEl);
        }

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

        let p = (panelEl instanceof HTMLElement) ? new ImagePanel(panelEl) : ImagePanel.focP;
        // p.removeLink();
        // p.injectSearchByImage();
        // p.addDownloadRelatedImages();
        p.makeDescriptionClickable();
        p.addImageAttributes();
        p.update_SiteSearch();
        p.update_ViewImage();
        p.update_ImageHost();
        p.update_sbi();

        // add extensions boxes
        for (const imgBox of panelEl.qa('div.irc_rimask:not(.ext)')) {
            addImgExtensionBox(imgBox);
        }

        // rarbg torrent link
        let torrentLink = p.q('.torrent-link'),
            linkIsTorrent = /\/torrent\//gi.test(p.pTitle_Anchor.href);
        if (!!torrentLink) {
            torrentLink.style.display = linkIsTorrent ? 'inline-block' : 'none';
        }
    }
    static moreSizes() {
        const panel = ImagePanel.focP;
        const reverseImgSearchUrl = getGImgReverseSearchURL(panel.ris_fc_Div.querySelector('img').src);
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
                }
                )
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
        const descriptionEl = this.descriptionEl;
        function openDescription() {
            window.open(gImgSearchURL + encodeURIComponent(cleanSymbols(this.innerHTML)), '_blank');
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
        const href = '#'; //getGImgReverseSearchURL(this.imageUrl);
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
            const hostname = getHostname(isDdgUrl(url) ? reverseDdgProxy(url) : url);
            // updating ImageHost
            const ih = this.q('a.image-host');
            if (ih) {
                ih.innerText = hostname;
                ih.href = gImgSearchURL + 'site:' + hostname;

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
            openInTab(siteSearchUrl(getHostname(this.sTitle_Anchor.href)));
        } catch (e) {
            console.warn(e);
        }
    }

    inject_SiteSearch() {
        const href = '#'; //getGImgReverseSearchURL(this.imageUrl);
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
            siteSearchAnchor.href = (siteSearchUrl(getHostname(ImagePanel.focP.q('span a.irc_lth.irc_hol').href)));
        } else {
            console.warn('Site Search element not found:', siteSearchAnchor);
        }

        const ddgAnchor = this.q('#ddgSearch');
        if (ddgAnchor) {
            ddgAnchor.href = ddgProxy(this.pTitle_Anchor.href);
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
        createAndAddAttribute(this.mainImage, 'img-title', this.pTitle_Text);
        createAndAddAttribute(this.mainImage, 'img-subtitle', this.sTitle_Text);
        createAndAddAttribute(this.mainImage, 'description', this.descriptionText);
        createAndAddAttribute(this.mainImage, 'download-name', this.sTitle_Text);
    }
    lookupTitle() {
        console.log('lookup title:', this.bestNameFromTitle);
        openInTab(gImgSearchURL + encodeURIComponent(cleanSymbols(this.bestNameFromTitle)));
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


go();
var url = new URL(location.href);
if (url.searchParams.get('tbm') === 'isch') { // TODO: find a better way of determining whether the page is a Google Image search

    function cleanSearch() {
        console.log('cleanSearch()');
        const searchBar = q(Consts.Selectors.searchBox);
        searchBar.value = cleanDates(searchBar.value).replace(/\s+|[.\-_]+/g, ' ');
    }
    Mousetrap.bind(['c c'], cleanSearch);
    Mousetrap.bind(['u'], () => {
        location.assign(safeSearchOffUrl());
    });
    // to https://yandex.com/images/search?text=
    Mousetrap.bind('y d x', () => {
        var x = 'https://yandex.com/images/search?text=' + encodeURIComponent(new URL(location.href).searchParams.get('q'));
        console.log('Yandex url = ', x);
        location.assign(x);
    });

    window.addEventListener('keydown', onKeyDown, true);
    console.log('added super google key listener');
    window.addEventListener('load', function modifyImgsOnLoad() {
        for (const a of getImgAnchors()) {
            let img = a.querySelector('img');
            if (!img) continue;
            createAndAddAttribute(img, 'download-name', getGimgDescription(img));
            markImageOnLoad(img, a.href);
        }
    }, true);
} else {
    observeDocument(GSaves.toDirectUrls);
}

/**
 * Add small text box containing image extension
 * @param imgBox
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
    const img = imgBox.querySelector('img.rg_ic.rg_i'),
        meta = getMeta(img),
        src = meta ? meta.ou : img.src;
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
 * @param meta
 */
function downloadImageFromMeta(meta) {
    download(meta.ou);
}

observeDocument(function (mutationTarget, addedNodes) {
    const addedImageBoxes = mutationTarget.querySelectorAll('.rg_bx:not(.rg_bx_listed)');
    if (mutationTarget.classList.contains('rg_bx') || addedImageBoxes.length) {
        onImagesLoading(addedImageBoxes);
    }
}, { singleCallbackPerMutation: true });
// attach chgMon to document.body


function go() {
    if (onGoogleImages) {
        try {
            // iterating over the stored ubl sites
            for (const ublHostname of GM_getValue(Consts.GMValues.UBL_SITES, new Set())) ublSitesSet.add(ublHostname);
            for (const ublURL of GM_getValue(Consts.GMValues.UBL_URLS, new Set())) ublMetas.add(ublURL);
            for (const [ublHostname, data] of new Map(GM_getValue(Consts.GMValues.UBL_SITES_MAP, new Map()))) ublMap.set(ublHostname, data);
            if (Preferences.periodicallySaveUnblockedSites)
                setInterval(storeUblSitesSet, 5000);

            // if (new URL(location.href).searchParams.get('allsizes'))
            {
                var showAllSizesAnchor = q(Consts.Selectors.showAllSizes);
                if (!!showAllSizesAnchor) showAllSizesAnchor.click();
            }
            const conditionSelector = '#irc_cc > div';

            waitForElement(() => {
                if (ImagePanel.mainPanelEl && ImagePanel.focP && ImagePanel.focP.mainImage && ImagePanel.focP.buttons) {
                    return qa(conditionSelector);
                }
            }, function startPanelModifications(panelEl) {
                ImagePanel.modifyP(panelEl);
                const mutationObserver = new MutationObserver(function (mutations) { // #todo: optimize callbacks, #profiler:  17.9% of the browser delay is from this
                    mutations.forEach(function (mutation) {
                        if (!mutation.addedNodes.length) {
                            return;
                        }
                        try {
                            if (!!ImagePanel.focP) {
                                ImagePanel.updateP(ImagePanel.focP);
                            }
                            const dlLimitSlider = q('#dlLimitSlider');
                            if (dlLimitSlider) dlLimitSlider.setAttribute('max', qa('.rg_bx').length);
                        } catch (e) {
                            console.warn(e, 'Focused panel:', ImagePanel.focP);
                        }
                    })
                });

                const target = ImagePanel.mainPanelEl;
                // console.debug('Target element to be observed:', target, 'type:', typeof target);
                mutationObserver.observe(target, {
                    childList: true, subtree: true,
                    attributes: false, characterData: true
                });
            });

            (function bindKeys() {
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
            })();
            // adds a toggleEncryptedGoogle button
            /*q('#ab_ctls').appendChild(createElement(`<i class="ab_ctl">
        <a id="toggleEngrypted" href="${toggleEncryptedGoogle(true)}"> ${/www\.google/.test(location.hostname) ? "engrypted.google&nbsp;⇌" : "www.google.com"}</a>
    </i>`));*/
        } catch (e) {
            console.error(e);
        }

        waitForElement('#hdtb-msb', injectGoogleButtons);
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

/** @param visibleThumbnailsOnly
 * @returns {set<HTMLImageElement>} */
function getThumbnails(visibleThumbnailsOnly) {
    // language=CSS
    const selector = 'div.rg_bx > a.rg_l[jsname="hSRGPd"] > img' +
        (visibleThumbnailsOnly ? ':not([style*=":none;"]):not([visibility="hidden"])' : '')
        ;
    return qa(selector);
}
// done:    Make a navbar that drops down containing all the buttons and controls

function updateQualifiedImagesLabel(value) {
    value = value != null ? value : Array.from(getQualifiedGImgs()).length;
    const satCondLabel = q('#satCondLabel');
    if (satCondLabel)
        satCondLabel.innerHTML = `${value} images satisfying conditions`;

    const dlLimitSlider = q('#dlLimitSlider');
    if (dlLimitSlider && dlLimitSlider.value < value) {
        dlLimitSlider.setAttribute('value', value);
        q('#dlLimitSliderValue').innerText = value;
    }
    /*if (q("#OnlyShowQualifiedImages").checked)
        for (const img of getThumbnails()) {
            const qualified = img.hasAttribute('qualified-dimensions');
            setVisible(img, qualified);
        }
        */
}
/**Modify the navbar and add custom buttons*/
function injectGoogleButtons() {
    try {
        let controlsContainer = createElement(`<div id="${controlsContainerId}"</div>`);
        const googleButtonsContainer = document.querySelector('#hdtb-msb');
        /*q('#abar_button_opt').parentNode*/ //The "Settings" button in the google images page

        var navbar = createAndGetNavbar(function (topnavContentDiv) {
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


        /**
         * @param id    the checkbox element id
         * @param labelText
         * @param changeListener    what happens when the text box changes?
         * @param checked
         * @returns {HTMLDivElement} this label element contains a checkbox input element
         */
        function createGCheckBox(id, labelText, changeListener, checked) {
            var checkBoxContainerEl;

            checkBoxContainerEl = createElement(
                `<div class="sg" style="display:inline;">
<input id="${id}" type="checkbox" ${(checked !== null ? checked : GM_getValue(id)) ? 'checked="checked"' : ''}>
<label for="${id}">${labelText.replace(/\s/g, '&nbsp;')}</label>
</div>`);
            if (typeof changeListener === 'function') {
                checkBoxContainerEl.addEventListener('change', changeListener);
            }
            return checkBoxContainerEl;
        }

        // Check boxes
        const cbox_ShowFailedImages = createGCheckBox('hideFailedImagesBox', 'Show failed images', _sfi, Preferences.hideFailedImagesOnLoad);
        const cbox_GIFsOnly = createGCheckBox('GIFsOnlyBox', 'GIFs only', _gifsOnly, false);
        const cbox_UseDdgProxy = createGCheckBox('useDdgProxyBox', 'Use proxy',
            () => {
                Preferences.useDdgProxy = q('#useDdgProxyBox').checked;
                updateQualifiedImagesLabel();
            },
            Preferences.useDdgProxy
        );

        // passive checkbox
        const cbox_GIFsException = createGCheckBox('GIFsExceptionBox', 'Always download GIFs',
            () => GM_setValue('GIFsException', q('#GIFsExceptionBox').checked),
            GM_getValue('GIFsException', true)
        );
        // passive checkbox
        const cbox_OnlyShowQualifiedImages = createGCheckBox('OnlyShowQualifiedImages', 'Only show qualified images',
            () => GM_setValue('OnlyShowQualifiedImages', this.checked),
            GM_getValue('OnlyShowQualifiedImages', false)
        );

        /** Show failed images */
        function _sfi() {
            const checked = q('#hideFailedImagesBox').checked;
            setVisibilityForFailedImages(checked);
            Preferences.hideFailedImagesOnLoad = !q('#hideFailedImagesBox').checked;
        }

        function _gifsOnly() {
            _sfi();
            const checked = q('#GIFsOnlyBox').checked;
            for (const nonGifImg of qa(`.rg_bx a.rg_l img`)) {
                if (!/\.gif($|\?)/.test(getMeta(nonGifImg).ou)) {
                    console.debug('nonGifImg href doesn\'t end with .gif, settings visibility to:', checked, nonGifImg);
                    setVisible(nonGifImg, checked);
                }
            }
        }

        for (const img of getThumbnails(true)) {
            img.classList.add('blur');
        }

        //todo: make the image size slider increment discretely, depending on the available dimensions of the images
        // Sliders
        const default_slider_minImgSize_value = 250;
        slider_minImgSize = createElement(`<input id="minImgSizeSlider" type="range" min="0" max="3000" value="${default_slider_minImgSize_value}" step="25">`);
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
            for (const img of qa('.sg-too-small-hide')) {
                setVisible(img, false);
            }
            clearEffectsDelayed();
            updateQualifiedImagesLabel();
        };

        slider_dlLimit = createElement(`<input id="dlLimitSlider" type="range" min="1" max="${1000}" value="20">`);
        var sliderReading_dlLimit = createElement(`<label id="dlLimitSliderValue">${slider_dlLimit.value}</strong>`);
        slider_dlLimit.oninput = function () {
            sliderReading_dlLimit.innerHTML = this.value;

            // Highlighting images that will be downloaded

            // blur all


            var i = 0;
            /*
            for (const qualifiedImgObj of getQualifiedGImgs(null, null, true)) {
                const img = qualifiedImgObj.img;
                console.debug('i:', i, 'this.value:', this.value);
                if(++i <= this.value) {
                    img.classList.add('drop-shadow', 'out');
                    img.classList.remove('in');
                }
            }
            */

            for (const img of qa('.rg_bx img.qualified-dimensions')) {
                if (++i <= this.value) {
                    img.classList.add('drop-shadow', 'out');
                    img.classList.remove('in');
                } else {
                    img.classList.remove('out');
                    img.classList.add('blur', 'in');
                }
            }
            // un-blur the remaining images (even though they may not satisfy img dimensions)
            for (const img of qa('.rg_bx img:not(.qualified-dimensions)')) {
                if (++i <= this.value) {
                    img.classList.add('drop-shadow', 'out');
                    img.classList.remove('in');
                } else {
                    img.classList.remove('out');
                    img.classList.add('blur', 'in');
                }
            }

            updateQualifiedImagesLabel();
        };
        slider_dlLimit.onchange = function () {
            clearEffectsDelayed();
        };

        var satCondLabel = createElement(`<label id="satCondLabel">Images satisfying conditions: 0</label>`);

        var timeOut;
        function clearEffectsDelayed() {
            clearTimeout(timeOut);
            timeOut = setTimeout(function () {
                clearAllEffects();
                // updateQualifiedImagesLabel();
            }, 800);
        }

        // buttons
        function createGButton(id, innerText, onClick) {
            const button = createElement(`<button class="${Consts.ClassNames.BUTTONS} sg sbtn hdtb-tl" id="${id}">${innerText.replace(/\s/g, '&nbsp;')}</button>`);
            if (onClick && typeof (onClick) === 'function') button.onclick = function () {
                onClick();
            };
            return button;
        }


        // Display originals
        const downloadImages = function downloadImages() {
            const zipBox = q('#zipInsteadOfDownload');
            if (zipBox && zipBox.checked) {
                if (!zip || Object.keys(zip.files).length < 1) {
                    gZipImages();
                } else {
                    genZip();
                }
            } else {
                if (currentDownloadCount >= slider_dlLimit.value) {
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
                            qualifiedGImgs[i]
                        );
                        currentDownloadCount++;
                        i++;
                    } else {
                        clearInterval(downloadInterval);
                    }
                }, 300);
            }
        };
        var btn_dispOgs = createGButton('dispOgsBtn', 'Display <u>o</u>riginals', displayImages),
            btn_animated = createGButton('AnimatedBtn', '<u>A</u>nimated', function () {
                q('#itp_animated').firstElementChild.click();
            }),
            btn_download = createGButton('downloadBtn', 'Download ⇓', downloadImages),
            btn_preload = createGButton('preloadBtn', 'Preload images ↻', function () {
                const imgLinks = Array.from(qa('a.rg_l[href]'));
                console.log('imgLinks:', imgLinks);

                for (const a of imgLinks) {
                    let img = a.querySelector('img'),
                        dlName = cleanGibberish(getMeta(img)['pt']);

                    createAndAddAttribute(img, 'download-name', dlName);
                    img.alt = dlName;
                    // ImageManager.markImageOnLoad(img, a.getAttribute('href'));
                    console.log('Preloading image:', `"${dlName}"`, !isBase64ImageData(img.src) ? img.src : 'Base64ImageData');
                }
            }),
            btn_downloadJson = createGButton('dlJsonBtn', 'Download JSON {}', downloadJSON);


        btn_download.style.margin = '20px';
        btn_download.style.border = '20px';

        var cbox_ZIP = createGCheckBox('zipInsteadOfDownload', 'ZIP', function changeZIPBtnText() {
            const checked = cbox_ZIP.checked;
            const downloadBtn = q('#downloadBtn');
            downloadBtn.innerHTML = checked ?
                (!downloadBtn.classList.contains('genzip-possible') ? 'ZIP&nbsp;images' : 'Download&nbsp;ZIP&nbsp;⇓') :// "zip" or "download zip"
                'Download&nbsp;⇓';
            GM_setValue('zipInsteadOfDownload', checked);
        }, GM_getValue('zipInsteadOfDownload', true));
        cbox_ZIP.style.padding = '0px';

        var downloadPanel = createElement('<div id="download-panel" style="display: block;"></div>');

        var sliderConstraintsContainer = document.createElement('tb');
        var tr1 = document.createElement('tr');
        tr1.appendChild(slider_minImgSize);
        tr1.appendChild(sliderReading_minImgSize);
        var tr2 = document.createElement('tr');
        tr2.appendChild(slider_dlLimit);
        tr2.appendChild(sliderReading_dlLimit);
        sliderConstraintsContainer.classList.add('sg');
        sliderConstraintsContainer.appendChild(tr1);
        sliderConstraintsContainer.appendChild(tr2);

        // Appending buttons to downloadPanel
        for (const el of [cbox_ZIP, btn_download, btn_preload, btn_downloadJson, sliderConstraintsContainer]) {
            downloadPanel.appendChild(el);
        }

        // automatically display originals if searching for a site:
        if (/q=site:/i.test(location.href) && !/tbs=rimg:/i.test(location.href)) {
            displayImages();
        }

        // todo: append the element somewhere else, where it will also be appended with the web search (not only the image search)
        // search engine dropdown
        var searchEngineSelect = createElement(`<select id="search-engine-select">
    <option id="google-search">Google</option>
    <option id="yandex-search">Yandex</option>
    <option id="ddg-search">DuckDuckGo</option>
</select>`);
        searchEngineSelect.onchange = function (event) {
            switch (searchEngineSelect.value.toLowerCase()) {
                case 'yandex':
                    location.assign('https://yandex.com/images/search?text=' + encodeURIComponent(new URL(location.href).searchParams.get('q')));
                    break;
                case 'duckduckgo':
                    location.assign('https://duckduckgo.com/?&kao=-1&kp=-2&k1=-1&kak=-1&atb=v50-4&t=hf&iax=images&ia=' + (/&tbm=isch/.test(location.href) ? 'images' : 'web') + '&q=' + encodeURIComponent(new URL(location.href).searchParams.get('q')));
                    break;
            }
        };


        var defaultDownlodPath = '';
        /** contains the current download path, changing it will change the download path */
        var pathBox = createElement(`<div class="sg" style="display: inline;">
<input id="download-path" value="${defaultDownlodPath}"><label>Download path</label>
</div>`);

        const divider = document.createElement('div');
        controlsContainer.appendChild(divider);
        // appending buttons and controls
        divider.after(btn_dispOgs, cbox_ShowFailedImages, cbox_GIFsOnly, cbox_UseDdgProxy, cbox_GIFsException, cbox_OnlyShowQualifiedImages, btn_animated, searchEngineSelect, pathBox, downloadPanel);
        sliderConstraintsContainer.after(satCondLabel);
        downloadPanel.appendChild(createElement(`<div id="progressbar-container"></div>`));

        btn_download.innerHTML = cbox_ZIP.checked ? 'ZIP&nbsp;images' : `Download&nbsp;⇓`;
    } catch (r) {
        console.error(r);
    }
}
function clearAllEffects() { // remove highlighting of elements
    console.warn('clearAllEffects()');
    for (const effectClassName of ['highlight', 'drop-shadow', 'transparent', 'sg-too-small', /*'qualified-dimensions',*/ 'sg-too-small-hide', 'in']) {
        for (const el of qa('.' + effectClassName)) {
            el.classList.remove(effectClassName);
            el.classList.add('out');
        }
    }
}

function getQualifiedUblImgMetas() {
    let qualifiedUblImgMetas = new Set();
    for (const img of qa(`.${Consts.ClassNames.DISPLAY_ORIGINAL}, img[loaded="true"]`)) {
        if (img.classList.contains(Consts.ClassNames.FAILED) || img.classList.contains(Consts.ClassNames.FAILED_DDG))
            continue;
        let meta = getMeta(img);
        if (meta && Math.max(meta.ow, meta.oh) < 120) continue;
        meta.imgEl = img;

        qualifiedUblImgMetas.add(meta);
        console.log('Ubl URLs:', isBase64ImageData(img.src) ? 'base64 image data...' : img.src);
    }
    return qualifiedUblImgMetas;
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
            const w = parseInt(meta.ow);
            const h = parseInt(meta.oh);

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


function storeUblSitesSet() {
    for (const imgMeta of getQualifiedUblImgMetas()) {
        let hostname = getHostname(imgMeta.src);
        if (/tumblr\.com/.test(hostname)) hostname = hostname.replace(/^\d+?\./, '');
        if (/google|gstatic/i.test(hostname)) {
            hostname = getHostname(imgMeta.anchor.href);
            if (/google|gstatic/i.test(hostname)) {
                continue;
            }
        }
        ublSitesSet.add(hostname);
    }
    const stored = GM_getValue(Consts.GMValues.UBL_SITES);
    const merged = new Set(
        Array.from(stored)
            .concat(Array.from(ublSitesSet))
    );


    const diff = Array.from(ublSitesSet).filter(x => Array.from(stored).indexOf(x) < 0);
    GM_setValue(Consts.GMValues.UBL_SITES, Array.from(merged));

    console.log('Found new unblocked sites:', diff);
    return ublSitesSet;

}

function storeUblMetas() {
    for (const imgMeta of getQualifiedUblImgMetas()) {
        imgMeta.imgEl = undefined;
        ublMetas.add(imgMeta);
    }

    const stored = new Set(GM_getValue(Consts.GMValues.UBL_URLS, new Set()));
    for (const meta of stored) {
        ublMetas.add(meta);
    }
    console.debug(
        'stored ublURLs:', stored,
        '\nnew ublURLs:', ublMetas
    );

    GM_setValue(Consts.GMValues.UBL_URLS, Array.from(ublMetas).map(ublMeta => {
        if (!ublMeta || Array.isArray(ublMeta)) {
            ublMetas.delete(ublMeta);
            return;
        }
        delete ublMeta.clt;
        delete ublMeta.cl;
        delete ublMeta.cb;
        delete ublMeta.cr;
        delete ublMeta.sc;
        delete ublMeta.tu;
        delete ublMeta.th;
        delete ublMeta.tw;
        delete ublMeta.rh;
        delete ublMeta.rid;
        delete ublMeta.rt;
        delete ublMeta.itg;
        delete ublMeta.imgEl;

        return ublMeta;
    }));
    return ublMetas;
}
function storeUblMap() {
    for (const imgMeta of getQualifiedUblImgMetas()) {
        ublMap.addURL(imgMeta.src, imgMeta.imgEl.loaded === true || imgMeta.imgEl.loaded === 'ddgp', {
            imgEl: imgMeta.imgEl,
            dimensions: (imgMeta.ow + 'x' + imgMeta.oh)
        });
    }

    const stored = new Map(GM_getValue(Consts.GMValues.UBL_SITES_MAP, new Map()));
    for (const [k, v] of stored) {
        ublMap.addURL(k, v);
    }
    console.debug(
        'stored map:', stored,
        '\nnew ublMap:', ublMap
    );

    GM_setValue(Consts.GMValues.UBL_SITES_MAP, Array.from(ublMap.entries()));
    return ublMap;
}

/** @param selector
 * @return {NodeListOf<Node>}*/
function qa(selector) {
    return document.querySelectorAll(selector);
}
/** @param selector
 * @return {HTMLElement} */
function q(selector) {
    return document.querySelector(selector);
}

setInterval(clickLoadMoreImages, 400);
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
function onImagesLoading(addedImageBoxes) {
    console.log('onImagesLoading()');
    // if (imageSet.contains(addedImageBoxes)) return;
    // else imageSet.add(addedImageBoxes);

    for (const imageBox of addedImageBoxes) {
        imageBox.classList.add('rg_bx_listed');
        addImgExtensionBox(imageBox);
        addImgDownloadButton(imageBox);
    }

    (function updateDlLimitSliderMax() {
        const dlLimitSlider = q('#dlLimitSlider');
        if (dlLimitSlider) {
            const tmpValue = dlLimitSlider.getAttribute('value');
            const numImages = qa('.rg_bx').length;
            dlLimitSlider.setAttribute('max', numImages);

            const newValue = Math.min(numImages, tmpValue);
            dlLimitSlider.setAttribute('value', newValue);
            const sliderValueEl = q('#dlLimitSliderValue');
            if (sliderValueEl) sliderValueEl.setAttribute('value', newValue);
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
            function checkAndResetTimer(e) {
                if (!(pageX === e.pageX && pageY === e.pageY)) {
                    // console.log(`mouse has moved, is: (${e.clientX}, ${e.clientY}) was: (${pageX}, ${pageY})`);
                    clearTimeout(timeout);
                }
            }
            const replaceWithOriginal = (e) => {
                checkAndResetTimer(e);
                replaceImgSrc(bx.querySelector('img'), bx.querySelector('a'));
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
    return title + '_' + desc; // choosing one of them (prioratizing the description over the title)
}

/**
 * @param imageElement image element, either <img class="rg_ic rg_i" ....> in .rg_bx
 * todo: make this function detect if the image is a thumbnail or inside the panel, also make it work by getting the "id" and finding the meta through that
 * @param minified
 * @return
 * {{
 *   clt: string, id: string,
 *   isu: string, itg: string, ity: string,
 *   oh: string, ou: string, ow: string,
 *   pt: string,
 *   rid: string, rmt: string, rt: string, ru: string,
 *   s: string, st: string,
 *   th: string, tu: string, tw,
 *   src: string
 *  }}
 */
function getMeta(imageElement, minified=false) {
    var metaObj = {};
    if (!imageElement)
        return metaObj;

    try {
        metaObj = JSON.parse(getMetaText(imageElement));

        // removing useless properties
        if (minified)
            for (const propertyName of ['clt', 'cl', 'cb', 'cr', 'sc', 'tu', 'th', 'tw', 'rh', 'rid', 'rt', 'itg', 'imgEl'])
                if (metaObj.hasOwnProperty(propertyName))
                    delete metaObj[propertyName];

        metaObj.src = imageElement.src;
    } catch (e) {
        console.warn(e, imageElement);
    }

    /** @param img
     * @return {string} */
    function getMetaText(img) {
        //[Google.com images]
        /** @param thumbnail
         * @return {HTMLDivElement } */
        const getMetaEl = thumbnail => thumbnail.closest('div.rg_bx, div.irc_rimask') // nearest parent div container, `div.rg_bx` for thumbnails and `div.irc_rimask` for related images
            .querySelector('div.rg_meta'); // look for div.rg_meta, that should have the meta data

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


// /** @deprecated
// * Replaces the mainImage description link text */
// function replaceImgData(dataEls) {
//     if (typeof dataEls === 'undefined') return;
//     dataEls.querySelectorAll('.rg_meta').forEach(function (dataEl) {
//         if (dataEl.classList.contains('rg_meta-modified')) return;
//         try {
//             let dataText = dataEl.innerHTML;
//             let siteUrl = extractFromText(dataText, 'ru');
//             let description = extractFromText(dataText, 's');
//             let subTitle = extractFromText(dataText, 'st');

//             let imageAnchor = dataEl.previousSibling;
//             createAndAddAttribute(imageAnchor, 'rg_meta_st', subTitle);
//             createAndAddAttribute(imageAnchor, 'rg_meta_ru', siteUrl);

//             let hostname = getHostname(siteUrl).replace('www.', '');
//             let siteSearchUrl = GoogleImagesSearchURL + "site:" + encodeURIComponent(hostname);

//             dataEl.innerHTML = dataEl.innerHTML
//                 .replace(subTitle, 'site search: ' + hostname) // replace SubTitle text with site HOSTNAME
//                 .replace(siteUrl, siteSearchUrl) // replace title lin with site siteSearch link
//                 // .replace(description, HOSTNAME)
//                 ;

//             dataEl.classList.add('rg_meta-modified');
//         } catch (exception) {
//             console.error("Caught exception while changin rg_meta:", exception);
//         }
//     });
// }



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

/* hot-keys*/
let KeyEvent;
if (typeof KeyEvent === 'undefined') {
    /* var str="KeyEvent = {\n"; for(var i=0; i<500; i++){ str+= "DOM_VK_" + String.fromCharCode(i) + ": " + i +",\n"; } str=str.substr(0, str.length-2)+"\n}" */
    KeyEvent = {
        DOM_VK_BACKSPACE: 8,
        DOM_VK_TAB: 9,
        DOM_VK_ENTER: 13,
        DOM_VK_SHIFT: 16,
        DOM_VK_CTRL: 17,
        DOM_VK_ALT: 18,
        DOM_VK_PAUSE_BREAK: 19,
        DOM_VK_CAPS_LOCK: 20,
        DOM_VK_ESCAPE: 27,
        DOM_VK_PGUP: 33,
        DOM_VK_PAGE_UP: 33,
        DOM_VK_PGDN: 34,
        DOM_VK_PAGE_DOWN: 34,
        DOM_VK_END: 35,
        DOM_VK_HOME: 36,
        DOM_VK_LEFT: 37,
        DOM_VK_LEFT_ARROW: 37,
        DOM_VK_UP: 38,
        DOM_VK_UP_ARROW: 38,
        DOM_VK_RIGHT: 39,
        DOM_VK_RIGHT_ARROW: 39,
        DOM_VK_DOWN: 40,
        DOM_VK_DOWN_ARROW: 40,
        DOM_VK_INSERT: 45,
        DOM_VK_DEL: 46,
        DOM_VK_DELETE: 46,
        DOM_VK_0: 48, DOM_VK_ALPHA0: 48,
        DOM_VK_1: 49, DOM_VK_ALPHA1: 49,
        DOM_VK_2: 50, DOM_VK_ALPHA2: 50,
        DOM_VK_3: 51, DOM_VK_ALPHA3: 51,
        DOM_VK_4: 52, DOM_VK_ALPHA4: 52,
        DOM_VK_5: 53, DOM_VK_ALPHA5: 53,
        DOM_VK_6: 54, DOM_VK_ALPHA6: 54,
        DOM_VK_7: 55, DOM_VK_ALPHA7: 55,
        DOM_VK_8: 56, DOM_VK_ALPHA8: 56,
        DOM_VK_9: 57, DOM_VK_ALPHA9: 57,
        DOM_VK_A: 65,
        DOM_VK_B: 66,
        DOM_VK_C: 67,
        DOM_VK_D: 68,
        DOM_VK_E: 69,
        DOM_VK_F: 70,
        DOM_VK_G: 71,
        DOM_VK_H: 72,
        DOM_VK_I: 73,
        DOM_VK_J: 74,
        DOM_VK_K: 75,
        DOM_VK_L: 76,
        DOM_VK_M: 77,
        DOM_VK_N: 78,
        DOM_VK_O: 79,
        DOM_VK_P: 80,
        DOM_VK_Q: 81,
        DOM_VK_R: 82,
        DOM_VK_S: 83,
        DOM_VK_T: 84,
        DOM_VK_U: 85,
        DOM_VK_V: 86,
        DOM_VK_W: 87,
        DOM_VK_X: 88,
        DOM_VK_Y: 89,
        DOM_VK_Z: 90,
        DOM_VK_LWIN: 91,
        DOM_VK_LEFT_WINDOW: 91,
        DOM_VK_RWIN: 92,
        DOM_VK_RIGHT_WINDOW: 92,
        DOM_VK_SELECT: 93,
        DOM_VK_NUMPAD0: 96,
        DOM_VK_NUMPAD1: 97,
        DOM_VK_NUMPAD2: 98,
        DOM_VK_NUMPAD3: 99,
        DOM_VK_NUMPAD4: 100,
        DOM_VK_NUMPAD5: 101,
        DOM_VK_NUMPAD6: 102,
        DOM_VK_NUMPAD7: 103,
        DOM_VK_NUMPAD8: 104,
        DOM_VK_NUMPAD9: 105,
        DOM_VK_MULTIPLY: 106,
        DOM_VK_ADD: 107,
        DOM_VK_SUBTRACT: 109,
        DOM_VK_DECIMAL_POINT: 110,
        DOM_VK_DIVIDE: 111,
        DOM_VK_F1: 112,
        DOM_VK_F2: 113,
        DOM_VK_F3: 114,
        DOM_VK_F4: 115,
        DOM_VK_F5: 116,
        DOM_VK_F6: 117,
        DOM_VK_F7: 118,
        DOM_VK_F8: 119,
        DOM_VK_F9: 120,
        DOM_VK_F10: 121,
        DOM_VK_F11: 122,
        DOM_VK_F12: 123,
        DOM_VK_NUM_LOCK: 144,
        DOM_VK_SCROLL_LOCK: 145,
        DOM_VK_SEMICOLON: 186,
        DOM_VK_EQUALS: 187,
        DOM_VK_EQUAL_SIGN: 187,
        DOM_VK_COMMA: 188,
        DOM_VK_DASH: 189,
        DOM_VK_PERIOD: 190,
        DOM_VK_FORWARD_SLASH: 191,
        DOM_VK_GRAVE_ACCENT: 192,
        DOM_VK_OPEN_BRACKET: 219,
        DOM_VK_BACK_SLASH: 220,
        DOM_VK_CLOSE_BRACKET: 221,
        DOM_VK_SINGLE_QUOTE: 222
    };
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

    while(!isTryingToClickLastRelImg) {
        // polling
        console.log('waiting to be done...');
    }
    return;
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
             const sibblingImg = panel.ris_fc_Div.querySelector('img');
             if (sibblingImg && sibblingImg.getAttribute('loaded') == 'undefined') {
                 console.debug('sibblingImg.loaded = ', sibblingImg.getAttribute('loaded'));
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

/**
 * Order of key strokes in naming convention:   Ctrl > Shift > Alt >  Meta
 * @param keyEvent
 * @returns {{CTRL_ONLY: boolean, SHIFT_ONLY: boolean, ALT_ONLY: boolean, META_ONLY: boolean, NONE: boolean}}
 */
function getKeyEventModifiers(keyEvent) {
    /** @type {{CTRL_ONLY: boolean, SHIFT_ONLY: boolean, ALT_ONLY: boolean, NONE: boolean}} */
    return {
        CTRL_SHIFT: keyEvent.ctrlKey && !keyEvent.altKey && keyEvent.shiftKey && !keyEvent.metaKey,
        CTRL_ALT: keyEvent.ctrlKey && keyEvent.altKey && !keyEvent.shiftKey && !keyEvent.metaKey,
        ALT_SHIFT: !keyEvent.ctrlKey && keyEvent.altKey && keyEvent.shiftKey && !keyEvent.metaKey,
        CTRL_ONLY: keyEvent.ctrlKey && !keyEvent.altKey && !keyEvent.shiftKey && !keyEvent.metaKey,
        CTRL_ALT_SHIFT: keyEvent.ctrlKey && keyEvent.altKey && keyEvent.shiftKey && !keyEvent.metaKey,

        SHIFT_ONLY: !keyEvent.ctrlKey && !keyEvent.altKey && keyEvent.shiftKey && !keyEvent.metaKey,
        ALT_ONLY: !keyEvent.ctrlKey && keyEvent.altKey && !keyEvent.shiftKey && !keyEvent.metaKey,
        META_ONLY: !keyEvent.ctrlKey && !keyEvent.altKey && !keyEvent.shiftKey && keyEvent.metaKey,

        NONE: !keyEvent.ctrlKey && !keyEvent.shiftKey && !keyEvent.altKey && !keyEvent.metaKey
    };
}
// todo: replace this with Mousetrap.js
function onKeyDown(e) { // there will be no event if the target element is of type input (example: typing in the search bar, no hotkey will activate)
    const targetElIsInput = targetIsInput(e);
    const k = (window.event) ? e.keyCode : e.which;
    const modKeys = getModKeys(e);

    // keys that don't need a focusedPanel and all those other variables
    switch (k) {
        case KeyEvent.DOM_VK_R:
            if (targetElIsInput) break;
            if (modKeys.CTRL_ONLY || modKeys.ALT_ONLY) {
                e.preventDefault();
                toggleEncryptedGoogle();
                break;
            }
        // noinspection FallThroughInSwitchStatementJS
        case KeyEvent.DOM_VK_I:
            if (targetElIsInput) break;
            var mi = getMenuItems();
            if (mi.images.firstElementChild) {
                mi.images.firstElementChild.click();
            }
            break;
        case KeyEvent.DOM_VK_FORWARD_SLASH: // focus search box
            const searchBar = q(Consts.Selectors.searchBox);
            if (!$(searchBar).is(':focus')) {
                searchBar.focus();
                searchBar.scrollIntoView();
                searchBar.select();
                searchBar.setSelectionRange(0, searchBar.value.length); // this one is for compatability
                e.preventDefault();
            }
            break;
    }

    if (targetElIsInput) {
        return false;
    }

    if (!ImagePanel.mainPanelEl || typeof ImagePanel.mainPanelEl === 'undefined') {
        console.debug('Main mainImage panel not found!!');
        return;
    }
    const focusedPanel = ImagePanel.focP; //getFocusedPanel(); //ImagePanel.focusedPanel; // the active panel
    if (!focusedPanel) {
        console.warn('PANEL NOT FOUND!');
        return false;
    }

    // @info mainImage drop-down panel:    #irc_bg

    // keys between 1 and (#buttons-1)
    if (k >= KeyEvent.DOM_VK_ALPHA1 && k <= (KeyEvent.DOM_VK_ALPHA1 + focusedPanel.buttons.length - 1)) {
        if (focusedPanel.buttons) {
            focusedPanel.buttons[e.key - 1].click();
        } else {
            console.warn('Panel buttons not found');
        }
    }

    switch (k) {
        // case KeyEvent.DOM_VK_ESCAPE:
        //     break;
        case KeyEvent.DOM_VK_CLOSE_BRACKET: // ]
            if (modKeys.NONE) { // increment minImgSize
                const minImgSizeSlider = q('#minImgSizeSlider');
                minImgSizeSlider.value = parseInt(minImgSizeSlider.value) + parseInt(minImgSizeSlider.step);
            }
            break;
        case KeyEvent.DOM_VK_OPEN_BRACKET: // [
            if (modKeys.NONE) { // decrement minImgSize
                const minImgSizeSlider = q('#minImgSizeSlider');
                minImgSizeSlider.value = parseInt(minImgSizeSlider.value) - parseInt(minImgSizeSlider.step);
            } else if (modKeys.CTRL_ONLY) { // trim left search query
                const searchBox = q('#lst-ib');
                // var unwantedStr = searchBox.value.match(/(?<=([.:])).+?\./);
                var unwantedStr = searchBox.split(/\.|(site:)/g).slice(1, -1).filter(x => !!x).join('.');
                if (!unwantedStr)
                    break;
                searchBox.value = searchBox.value.replace(unwantedStr[0], '');
                searchBox.form.submit();
            }
            break;
        case KeyEvent.DOM_VK_SINGLE_QUOTE: // '
            if (!modKeys.NONE) { //    toggle "loop-relImgs" option on/off
                Preferences.loopbackWhenCyclingRelatedImages = !Preferences.loopbackWhenCyclingRelatedImages;
                GM_setValue('LOOP_RELATED_IMAGES', Preferences.loopbackWhenCyclingRelatedImages);
                console.log('LOOP_RELATED_IMAGES toggled to:', Preferences.loopbackWhenCyclingRelatedImages);
            }
            break;
        case KeyEvent.DOM_VK_T: // T (for torrent)
            console.debug('Torrent search');
            openInTab(gImgSearchURL + encodeURIComponent('+torrent +rarbg ' + cleanSymbols(focusedPanel.bestNameFromTitle)));
            break;
        case KeyEvent.DOM_VK_S: // S
            if (modKeys.NONE) { // Save
                var btn_Save = focusedPanel.q('.i15087');
                console.debug('btn_Save', btn_Save);
                if (!!btn_Save) btn_Save.click();
            }
            break;
        case KeyEvent.DOM_VK_V: // View saves
            if (modKeys.NONE) {
                var btn_ViewSaves = focusedPanel.q('.i18192');
                console.debug('btn_ViewSaves', btn_ViewSaves);
                if (!!btn_ViewSaves) btn_ViewSaves.click();
            }
            break;
        case KeyEvent.DOM_VK_B: // Search By image
        case KeyEvent.DOM_VK_NUMPAD1:// ⬋
            if (modKeys.NONE) { // Search by image
                const focusedRelatedImageUrl = focusedPanel.ris_fc_Url;
                if (typeof focusedPanel.mainImage !== 'undefined') {
                    focusedPanel.q('a.search-by-image').click();
                    console.debug('focusedRelatedImageUrl:', focusedRelatedImageUrl);
                } else {
                    console.error('Image not found', focusedRelatedImageUrl);
                }
            }
            break;
        case KeyEvent.DOM_VK_NUMPAD4:// ◀
            if (modKeys.NONE) {
                ImagePanel.previousImage();
            }
            break;
        case KeyEvent.DOM_VK_NUMPAD6: // ▶
            if (modKeys.NONE) {
                ImagePanel.nextImage();
            }
            break;
        // Open related images (press the bottom right square in the corner) in new tab
        case KeyEvent.DOM_VK_NUMPAD3:// ⬊
            if (modKeys.NONE) {
                const moreRelatedImagesLink = focusedPanel.q('.irc_rismo.irc_rimask a');
                if (moreRelatedImagesLink != null) {
                    openInTab(moreRelatedImagesLink.href);
                }
            }
            break;
        case KeyEvent.DOM_VK_D:
            if (modKeys.NONE) {
                ImagePanel.downloadCurrentImage();
            }
            break;
        case KeyEvent.DOM_VK_ENTER:
            console.log('Numpad5 pressed', e);
            if (modKeys.NONE) {
                const currentImgUrl = focusedPanel.ris_fc_Url;
                console.log('currentImgUrl:', currentImgUrl);
                openInTab(currentImgUrl);
            } else if (modKeys.SHIFT_ONLY) {    // NOT WORKING!!
                ImagePanel.downloadCurrentImage();
                // e.preventDefault();
            }
            break;
        // Previous related mainImage
        case KeyEvent.DOM_VK_COMMA:
        case KeyEvent.DOM_VK_UP:
        case KeyEvent.DOM_VK_NUMPAD8: // ▲
            // Prev/Left relImage
            if (modKeys.NONE) {
                prevRelImg();
                e.preventDefault();
                break;
            }
        // Next related mainImage
        case KeyEvent.DOM_VK_PERIOD: //fall-through
        case KeyEvent.DOM_VK_DOWN:
        case KeyEvent.DOM_VK_NUMPAD2:// ▼
            if (modKeys.NONE) {// Next/Right relImage
                nextRelImg();
                e.preventDefault();
            }
            break;
        case KeyEvent.DOM_VK_O:
            if (modKeys.NONE) {
                for (var div of focusedPanel.ris_Divs) {
                    const img = div.querySelector('img');
                    var anchor = img.closest('a[href]');
                    console.log('Replacing with original:', img, 'Anchor:', anchor);
                    replaceImgSrc(img, anchor);
                }
            }
            break;
        case KeyEvent.DOM_VK_H:
            if (modKeys.ALT_ONLY) {
                q('#rcnt').style.visibility = (/hidden/i).test(q('#rcnt').style.visibility) ? 'visible' : 'hidden';
                e.preventDefault();
            }
            break;
        case KeyEvent.DOM_VK_M:
            ImagePanel.download_ris();
            break;
        // I have options, I'll choose the best later
        case KeyEvent.DOM_VK_NUMPAD7:// ⬉
            if (modKeys.NONE) { // lookup the images title.
                const visitUrl = focusedPanel.buttons[0].href;
                // const visitTitleUrl = subtitleEl.href;

                console.log('Visit:', visitUrl);
                openInTab(visitUrl);
            }
            break;
        // Search using title
        case KeyEvent.DOM_VK_NUMPAD9:// ⬈
            if (modKeys.NONE) {
                focusedPanel.lookupTitle();
            }
            break;
        case KeyEvent.DOM_VK_NUMPAD5: //downloadCurrentImage
            ImagePanel.downloadCurrentImage();
            break;
        case KeyEvent.DOM_VK_SEMICOLON:
            if (modKeys.SHIFT_ONLY) {
                focusedPanel.siteSearch();
            }
            break;
        // TODO: find a hotkey for this function
        /*openInTab(`${gImgSearchURL}${encodeURIComponent(cleanSymbols(focusedPanel.descriptionText).trim())}`);
        e.preventDefault();*/
    }
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
            .replace(/rarbg|\.com|#|x264|DVDRip|720p|1080p|2160p|MP4|IMAGESET|FuGLi|SD|KLEENEX|BRRip|XviD|MP3|XVID|BluRay|HAAC|WEBRip|DHD|rartv|KTR|YAPG/gi, ' ')
    ).trim();
}

function getImgAnchors() {
    // return qa('#rg_s > div.rg_bx > a.rg_l[href]');
    return qa('#rg_s > div > a[href]');
}

/**
 * @param minified: delete unnescessary meta attributes?
 * @returns {Array} an array containing the meta objects of the images
 */
function getResultsData(minified = true) {
    let anchors = getImgAnchors();
    let set = new Set();
    for (let a of anchors) {
        var img;
        var meta = {};

        try {
            img = a.querySelector('img');
            meta = getMeta(img, minified);
            meta.loaded = img.getAttribute('loaded');

            if (minified) {
                delete meta.clt;
                delete meta.cl;
                delete meta.cb;
                delete meta.cr;
                delete meta.sc;
                delete meta.tu;
                delete meta.th;
                delete meta.tw;
                delete meta.rh;
                delete meta.rid;
                delete meta.rt;
                delete meta.itg;
                delete meta.imgEl;
                // delete meta.oh;
                // delete meta.ow;
            }
        } catch (e) {
            console.warn(e, a);
            continue;
        }
        if (meta == null) continue;
        set.add(meta);
    }
    return Array.from(set);
}

function downloadJSON() {
    let text = getResultsJSON(true, true);
    let name = 'GImg data_' + document.title;
    anchorClick(makeTextFile(text), name + '.json');
}

function getResultsJSON(minified = true, asText = false) {
    const o = {
        'title': document.title,
        'url': location.href,
        'search': q(Consts.Selectors.searchBox).value,
        'time': new Date().toJSON(),
        'data': getResultsData(minified)
    };
    return asText ? JSON.stringify(o, null, 4) : o;
}

function getIndexHtml() {
    return Array.from(qa('.rg_bx')).map(bx => {
        const meta = getMeta(bx);
        return `<div>
<img src="${meta.ou}" alt="${meta.pt}">
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
 *  load = "false":     image still loading
 *  load = "error":     image failed to load
 * @param imgUrl
 * @param imgEl
 */
function markImageOnLoad(imgEl, imgUrl) {
    if (!imgEl) return;
    imgUrl = !!imgUrl ? imgUrl : imgEl.src;
    if (imgEl.hasAttribute('loaded')) {
        return;
    }
    var imgObj = new Image();
    createAndAddAttribute(imgEl, 'loaded', false);
    imgObj.onerror = function () {
        imgEl.setAttribute('loaded', 'error');
    };
    imgObj.onload = function () {
        imgEl.setAttribute('loaded', true);
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
    zip.file('info.json', new Blob([getResultsJSON(minified = true, asText = true)], { type: 'text/plain' }));

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

            if (!isDdgUrl(res.finalUrl)) {
                console.debug(
                    'retrying with ddgproxy',
                    '\nddgpURL:', ddgProxy(fileUrl),
                    '\nfileURL:', fileUrl,
                    '\nresponse.finalURL:', res.finalUrl
                );

                if (/<!DOCTYPE/.test(res.responseText)) {
                    console.error('Not image data!', res.responseText);
                    zip.current++;
                    return;
                }
                requestAndZipImage(ddgProxy(fileUrl), fileName, img);
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
                var blob = new Blob([res.response], { type: contentType });

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
                const downloadBtn = q('#downloadBtn');
                downloadBtn.classList.add('genzip-possible');
                downloadBtn.innerHTML = q('#zipInsteadOfDownload').checked ?
                    (!downloadBtn.classList.contains('genzip-possible') ? 'ZIP' : 'Download&nbsp;ZIP&nbsp;⇓') : // "zip" or "download zip"
                    'Download&nbsp;⇓';


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
    var regex = new RegExp(str2.match(/[^$-/:-?{-~!"^_`\[\]]+/g).join('|'), 'gi');
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


function setVisibilityForFailedImages(visibility) {

    // language=CSS
    /*
    const css = visibility ? '' :
        ` /!*Failed images selector*!/
    div.rg_bx > a.rg_l > img.${Tokens.FAILED_DDG},
    div.rg_bx > a.rg_l > img.${Tokens.FAILED} {
        display: none !important;
    }
`;
    const id = 'hide-failed-images-style';
    const styleEl = q('#' + id);
    if (!styleEl) {
        addCss(css, id);
    } else {
        styleEl.innerHTML = css;
    }
    */

    let bxs = qa(`div.rg_bx > a.rg_l > img.${Consts.ClassNames.FAILED_DDG}, div.rg_bx > a.rg_l > img.${Consts.ClassNames.FAILED}`);
    if (!bxs.length) return;

    let count = 0;
    for (const imageBox of bxs) {
        setVisible(imageBox, visibility);
        count++;
    }
    console.log(`Set visibility of ${count} images to`, visibility);
}
function setVisible(node, visible) {
    if (!node) return;
    if (onGoogleImages) {
        node = node.parentNode.parentNode;
    }

    if (visible) {
        node.classList.remove('hide-img');
    } else {
        node.classList.add('hide-img');
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
    const wordList = Array.from(qa('.rg_bx')).map(bx => {
        const meta = getMeta(bx);
        try {
            return (meta.pt ? meta.pt.split(rx) : [])
                .concat(meta.st ? meta.st.split(rx) : [])
                .concat(meta.s ? meta.s.split(rx) : []);
        } catch (e) {
            console.error(e);
        }
    }).reduce((occumulator, currentValue) => occumulator.concat(currentValue))
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

unsafeWindow.saveUblSites = saveUblSites;
unsafeWindow.getMeta = getMeta;

unsafeWindow.UblMetas = ublMetas;
unsafeWindow.storeUblMetas = storeUblMetas;
unsafeWindow.storeUblMap = storeUblMap;
unsafeWindow.getQualifiedGImgs = getQualifiedGImgs;
unsafeWindow.extractRarbgTorrentURL = extractRarbgTorrentURL;

unsafeWindow.getResultsData = getResultsData;
unsafeWindow.getResultsJSON = getResultsJSON;


// give a white border so that we'll have them all the same size
addCss(
    `div.rg_bx {	
    border-radius: 2px;
    border: 2px #fff solid;
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
    border: #454545 3px solid;
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
 * @param callback  this callback should be used when instantly adding content to the navbar,
 *  do NOT just take the returned value and start adding elements.
 *  @return {HTMLDivElement} returns the parent navbar element
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

function addCss(cssStr, id='') {
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
