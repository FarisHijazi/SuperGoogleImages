// ==UserScript==
// @namespace   VA_i
// @version     8.0.0.20171116
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       unsafeWindow
// @include     /^https?://(?:www|encrypted|ipv[46])\.google\.[^/]+/(?:$|[#?]|search|webhp|imgres)/
// @match       https://news.google.com/*
// @match       https://cse.google.com/cse/*
// @run-at      document-start
// @name        *Google: Bypass Result Page Redirect
// @name:zh-CN  Google：绕过搜索结果网页链接重定向
// @name:zh-TW  Google：繞過搜尋結果網頁鏈接重定向
// @description Avoid Google redirect for search result pages.
// @description:zh-CN 令 Google 直接链接至搜索结果网页，无须重定向。
// @description:zh-TW 令 Google 直接鏈接至搜尋結果網頁，無須重定向。
// ==/UserScript==


(function GoogleBypassResultPageRedirect() {
    var searchModeDiv = document.querySelector('div#hdtb-msb-vis' + ' div.hdtb-msel');
    if(!(searchModeDiv && searchModeDiv.innerHTML === 'Images')) return;
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

    function getOption() {
        var opt_noopen = false;
        // For example: open https://ipv4.google.com/#x-option:open-inplace
        switch (location.hash) {
            // Open links in the current tab.
            case '#x-option:open-inplace':
                opt_noopen = true;
                break;
            // Do not ...
            case '#x-option:no-open-inplace':
                opt_noopen = false;
                break;
            default:
                return M.getValue('opt_noopen', opt_noopen);
        }
        M.setValue('opt_noopen', opt_noopen);
        return {
            then: function (callback) {
                callback(opt_noopen);
            }
        };
    }

    function unsafeEval(func, opt) {
        let body = 'return (' + func + ').apply(this, arguments)';
        unsafeWindow.Function(body).call(unsafeWindow, opt);
    }

    getOption().then(function run(opt_noopen) {
        unsafeEval(function (opt_noopen) {

            var debug = false;
            var count = 0;

            var options = {opt_noopen: opt_noopen};
            debug && console.log('Options:', options);

            // web pages: url?url=
            // custom search engine: url?q=
            // malware: interstitial?url=
            var re = /\burl\?.*?\b(?:url|q)=(https?\b[^&#]+)/i;
            var restore = function (link, url) {
                var oldUrl = link.getAttribute('href') || '';
                var newUrl = url || oldUrl;
                var matches = newUrl.match(re);
                if (matches) {
                    debug && console.log('matches:', url, newUrl, matches,
                        '\nrestoring', link._x_id, link, oldUrl, '->', newUrl);
                    link.setAttribute('href', decodeURIComponent(matches[1]));
                    enhanceLink(link);
                } else if (url != null) {
                    link.setAttribute('href', newUrl);
                }
            };

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
             * set rel="noreferrer", referrerpolicy="no-referrer"
             * and stopImmediatePropagation onclick
             * @param a
             */
            var enhanceLink = function (a) {
                purifyLink(a);
                a.setAttribute('rel', 'noreferrer');
                a.setAttribute('referrerpolicy', 'no-referrer');
                if (options.opt_noopen) {
                    a.setAttribute('target', '_self');
                    a.addEventListener('click', function (event) {
                        event.stopImmediatePropagation();
                        event.stopPropagation();
                    }, true);
                }
            };

            var fakeLink = document.createElement('a');
            var normalizeUrl = function (url) {
                fakeLink.href = url;
                return fakeLink.href;
            };

            var setter = function (v) {
                v = String(v);  // in case an object is passed by clever Google
                debug && console.log('State:', document.readyState);
                debug && console.log('set', this._x_id, this, this.getAttribute('href'), v);
                restore(this, v);
            };

            var getter = function () {
                debug && console.log('get', this._x_id, this, this.getAttribute('href'));
                return normalizeUrl(this.getAttribute('href'));
            };

            var blocker = function (event) {
                event.stopPropagation();
                restore(this);
                debug && console.log('block', this._x_id, this, this.getAttribute('href'));
            };

            var handler = function (a) {
                if (a._x_id) {
                    restore(a);
                    return;
                }

                a._x_id = ++count;
                debug && a.setAttribute('x-id', a._x_id);
                if (Object.defineProperty) {
                    debug && console.log('define property', a._x_id);
                    Object.defineProperty(a, 'href', {get: getter, set: setter});
                } else if (a.__defineSetter__) {
                    debug && console.log('define getter', a._x_id);
                    a.__defineSetter__('href', setter);
                    a.__defineGetter__('href', getter);
                } else {
                    debug && console.log('define listener', a._x_id);
                    a.onmouseenter = a.onmousemove = a.onmouseup = a.onmousedown =
                        a.ondbclick = a.onclick = a.oncontextmenu = blocker;
                }
                if (/^_(?:blank|self)$/.test(a.getAttribute('target')) ||
                    /\brwt\(/.test(a.getAttribute('onmousedown')) ||
                    /\bmouse/.test(a.getAttribute('jsaction')) ||
                    /\bclick\b/.test(a.parentElement.getAttribute('jsaction'))) {
                    enhanceLink(a);
                }
                restore(a);
            };

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
                        debug && console.log('restore attribute', target._x_id, target, target.getAttribute('href'));
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

        }, opt_noopen);
    });

})();