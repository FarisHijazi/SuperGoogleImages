
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.PProxy = factory();
    }
}(this, function () {
    function isDdgUrl(url) {
        return /^https:\/\/proxy\.duckduckgo\.com/.test(url);
    }

    /**Returns the href wrapped with proxy.DuckDuckGo.com */
    function reverseDdgProxy(href) {
        // if (isZscalarUrl(href)) s = getOGZscalarUrl(href); // extra functionality:
        if (!isDdgUrl(href)) {
            return href;
        }
        return new URL(location.href).searchParams.get('u');
    }

    /**Returns a DuckDuckGo proxy url (attempts to unblock the url)*/
    var ddgProxy = function (url) {
        return isDdgUrl(url) || /^(javascript)/i.test(url) ? url : (`https://proxy.duckduckgo.com/iu/?u=${encodeURIComponent(url)}&f=1`);
    };

    ddgProxy.test = isDdgUrl;
    ddgProxy.reverse = reverseDdgProxy;
    ddgProxy.ddgProxy = ddgProxy;

    return {
        fileStack: url => ('https://process.filestackapi.com/AhTgLagciQByzXpFGRI0Az/' + encodeURIComponent(url.trim())),
        steemitimages: url => /\.(jpg|jpeg|tiff|png|gif)($|\?)/i.test(url) ? ('https://steemitimages.com/0x0/' + url.trim()) : url,
        ddg: ddgProxy,
        ddgProxy: ddgProxy,
    };
}));