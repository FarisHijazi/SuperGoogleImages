
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