
unsafeWindow.successfulUrlsSet = ublSitesSet;
// noinspection JSUnresolvedVariable
unsafeWindow.ublSitesSet = ublSitesSet;
unsafeWindow.ublMap = ublMap;

const ublSitesSet = new Set();
const ublMetas = new Set();

/** Contains the ubl data of a single domain name */
class UBLdata {
    constructor(href, successful, dataObj) {
        const url = (function () {
            return new URL(href);
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


function getUblImages() {
    return document.querySelectorAll('img[src][loaded="true"]:not([proxy])');
}
function getUblHostnames() {
    return Array.from(new Set(Array.from(getUblImages()).map(img => getHostname(img.src))));
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
/**
 const rg_meta = div.querySelector('.rg_meta') || document.querySelector(selector);
    * Returns a list of qualified image metas
    * @return {Meta[]}
    */
function getQualifiedUblImgMetas() {
    const condition = meta => (
        typeof (meta) !== 'undefined' &&
        !(meta.imgEl.classList.contains(Consts.ClassNames.FAILED) || meta.imgEl.classList.contains(Consts.ClassNames.FAILED_PROXY)) && // not marked as failed
        Math.max(meta.ow, meta.oh) >= 120 // not too small;
    );

    return [].map.call(getImgBoxes(' img.rg_i[loaded="true"], img.rg_i[loaded="true"]'), getMeta)
        .filter(condition);
}

unsafeWindow.collectUblSites = collectUblSites;
unsafeWindow.saveUblSites = saveUblSites;
unsafeWindow.UblMetas = ublMetas;
unsafeWindow.storeUblMetas = storeUblMetas;
unsafeWindow.storeUblMap = storeUblMap;

if (ublSitesSet.has(hostname)) {
    setStyleInHTML(self.sTitle_Anchor, 'color', `${Preferences.loading.successColor} !important`);
}

if (ublSitesSet.has(hostname)) {
    setStyleInHTML(ih, 'color', `${Preferences.loading.successColor} !important`);
}


// =======

//TODO: remove this completely
class GSaves {
    static get initialItem() {
        return google.pmc.colmob.initial_item.map(item => JSON.parse(item));
    }
    /**
     * @return {{ imageUrl:{string}, url:{string}, title:{string}, faviconUrl:{string}, redirectUrl:{string}, realUrl:{string} }}
     */
    static get initialItemObjectList() {
        function item2Obj(item) {
            const itemObj = {};
            try {
                itemObj.imageUrl = item[9] ? item[9][0] : null; // img url
                itemObj.url = item[5];
                itemObj.title = item[6];
                itemObj.faviconUrl = item[17];
                itemObj.redirectUrl = item[18];

                const searchParams = new URL(itemObj.redirectUrl, 'https://www.google.com').searchParams;
                console.log('searchParams for:', item, searchParams);

                const q = searchParams.get('q');
                const qUrl = new URL(q, 'https://google.com');

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
        const tempInnerHTML = element.innerHTML;
        element.innerHTML = '';
        element.appendChild(createElement(`<a class="mod-anchor" target="_blank" href="${href}">${tempInnerHTML}</a>`));
    }
    static wrapPanels() {
        console.log('wrapGSavesPanels()');

        const iio = this.initialItemObjectList;

        let i = 0;
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

        if (threeDots) {
            const dlj = createElement(`<button id="add-direct-urls-button" class="VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-INsAgc Rj2Mlf P62QJc Gdvizd"><span jsname="V67aGc" class="VfPpkd-vQzf8d">Direct urls</span></button>`);
            threeDots.closest('div[role="button"]').after(dlj);
            dlj.onclick = function () {
                GSaves.addDirectUrls();
            };
        }
    }
    static addDirectUrls(mutationTarget = {}) {
        GSaves.replaceWithDirectUrls();
        return;

        addCss('.RggFob .mL2B4d { text-align: center; }', 'gsaves-center-anchors');
        if (!mutationTarget) return;
        console.log('GSaves.addDirectUrls();');

        for (const a of mutationTarget.querySelectorAll('a.Uc6dJc')) {
            const usp = new URL(a.href, location.href).searchParams;
            if (usp.get('imgrefurl')) {
                const href = usp.get('imgrefurl');
                if (!a.parentElement.querySelector('.page-link')) {
                    a.after(createElement('<a class="page-link" target="_blank" href="' + href + '">page</a>'));
                }
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

        if (threeDots) {
            const dlj = createElement(`<button id="download-json-button" class="VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-INsAgc Rj2Mlf P62QJc Gdvizd"><span jsname="V67aGc" class="VfPpkd-vQzf8d">Download JSON {}</span></button>`);
            threeDots.closest('div[role="button"]').after(dlj);
            dlj.onclick = function () {
                GSaves.downloadJson();
            };
        }
    }
    static replaceWithDirectUrls(mutationTarget = document) {
        console.log('GSaves.toDirectUrls();');
        for (const a of mutationTarget.querySelectorAll('a.Uc6dJc')) {
            const usp = new URL(a.href).searchParams;
            const imgurl = usp.get('imgrefurl') || usp.get('imgurl');
            if (imgurl) {
                a.href = imgurl;
                console.log('imgurl', imgurl);
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
        anchorClick(makeTextFile(json), document.title + '.json');
    }
}

// TODO: move GSaves code to another script
// if on google.com/saves, add keyboard shortcuts
if (/google\..+\/save/.test(location.href)) {
    console.log('beginning of google.com/save site...');

    mousetrap.bind('`', function () {
        GSaves.wrapPanels();
    });

    observeDocument(function () {
        GSaves.addDirectUrlsButton();
        GSaves.addDLJsonButton();
    });
}
