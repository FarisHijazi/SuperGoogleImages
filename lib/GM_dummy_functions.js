/* 
 *	GM functions polyfill
 *	@author			Faris Hijazi	https://github.com/buzamahmooza
 *	@description 	Creates fake TamperMonkey functions (in case the extension isn't found). Use this script via "@require"
 *	so the compiler won't throw any errors.
 */


if (typeof unsafeWindow === "undefined") {
	console.warn(`unsafeWindow is not defined, using window`);
	unsafeWindow = window;
}

if (typeof GM_getValue !== 'function') {
    /**
     * Does some work and returns same type
     * @template T
     * @param {string} key
     * @param {T} [defaultValue=undefined]
     * @returns {T} object of the **same** type
     */
	GM_getValue = function(key, defaultValue) {
		console.warn(`GM_getValue(${key}, ${defaultValue}) is not defined, using dummy function.`);
		
		if (defaultValue != null)
			return defaultValue;
	};
}

if (typeof GM_setValue !== 'function') {
	GM_setValue = function(key, newValue) {
		console.warn(`GM_setValue(${key}, ${newValue}) is not defined, using dummy function.`);
	};
}


if (typeof GM_setClipboard !== 'function') {
	GM_setClipboard = function() {};
}

if (typeof window.focus !== 'function') {
	window.focus = function() {};
}

if (typeof window.close !== 'function') {
	window.close = function() {};
}
if (typeof GM_xmlhttpRequest !== 'function') {
    GM_xmlhttpRequest = function (options) {
        console.warn(`GM_xmlhttpRequest(${options}) is not defined, using dummy function`);
    };
}
/**
 * Response callback
 * @callback scriptish_response_callback
 * @param {number} responseCode
 * @param {string} responseMessage
 */

/**
* GM_xmlhttpRequest is a cross-origin version of XMLHttpRequest. The beauty of this function is that a user script can make requests that do not use the same-origin policy, creating opportunities for powerful mashups.
* 
* Restrictions
* GM_xmlhttpRequest restricts access to the http, https, ftp, data, blob, and moz-blob protocols.
* 
* If a script uses one or more @domains then the GM_xmlhttpRequest api will be restricted to those domains.
* 
* If the url provided does not pass the above criteria then a error will be thrown when calling GM_xmlhttpRequest
* 
* Arguments
* Object details
* A single object with properties defining the request behavior.
* 
* @param {String} method: Optional. The HTTP method to utilize. Currently only "GET" and "POST" are supported. Defaults to "GET".
* @param {String} url: The URL to which the request will be sent. This value may be relative to the page the user script is running on.
* @param {scriptish_response_callback} onload: Optional. A function called if the request finishes successfully. Passed a Scriptish response object (see below).
* @param {scriptish_response_callback} onerror: Optional. A function called if the request fails. Passed a Scriptish response object (see below).
* @param {scriptish_response_callback} onreadystatechange: Optional. A function called whenever the request's readyState changes. Passed a Scriptish response object (see below).
* @param {String} data: Optional. Content to send as the body of the request.
* @param {Object} headers: Optional. An object containing headers to be sent as part of the request.
* @param {Boolean} binary: Optional. Forces the request to send data as binary. Defaults to false.
* @param {Boolean} makePrivate: Optional. Forces the request to be a private request (same as initiated from a private window). (0.1.9+)
* @param {Boolean} mozBackgroundRequest: Optional. If true security dialogs will not be shown, and the request will fail. Defaults to true.
* @param {String} user: Optional. The user name to use for authentication purposes. Defaults to the empty string "".
* @param {String} password: Optional. The password to use for authentication purposes. Defaults to the empty string "".
* @param {String} overrideMimeType: Optional. Overrides the MIME type returned by the server.
* @param {Boolean} ignoreCache: Optional. Forces a request to the server, bypassing the cache. Defaults to false.
* @param {Boolean} ignoreRedirect: Optional. Forces the request to ignore both temporary and permanent redirects.
* @param {Boolean} ignoreTempRedirect: Optional. Forces the request to ignore only temporary redirects.
* @param {Boolean} ignorePermanentRedirect: Optional. Forces the request to ignore only permanent redirects.
* @param {Boolean} failOnRedirect: Optional. Forces the request to fail if a redirect occurs.
* @param {Integer} redirectionLimit: Optional. Range allowed: 0-10. Forces the request to fail if a certain number of redirects occur.
* Note: A redirectionLimit of 0 is equivalent to setting failOnRedirect to true.
* Note: If both are set, redirectionLimit will take priority over failOnRedirect.
* 
* Note: When ignore*Redirect is set and a redirect is encountered the request will still succeed, and subsequently call onload. failOnRedirect or redirectionLimit exhaustion, however, will produce an error when encountering a redirect, and subsequently call onerror.
* 
* Response Object
* This is the response object passed to the onload, onerror, and onreadystatechange callbacks described for the details object above.
* 
* @param {Object} ResponseObj the response object
* @param {String} ResponseObj.responseText: The response to the request in text form.
* @param {String} ResponseObj.responseJSON: If the content type is JSON (example: application/json, text/x-json, and more..) then responseJSON will be available.
* @param {Integer} ResponseObj.readyState: The state of the request. Refer to https://developer.mozilla.org/en/XMLHttpRequest#Properties
* @param {String} ResponseObj.responseHeaders: The string value of all response headers. null if no response has been received.
* @param {Integer} ResponseObj.status: The HTTP status code from the server. null if the request hasn't yet completed, or resulted in an error.
* @param {String} ResponseObj.statusText: The entire HTTP status response string from the server. null if the request hasn't yet completed, or resulted in an error.
* @param {String} ResponseObj.finalUrl: The final URL used for the request. Takes redirects into account. null if the request hasn't yet completed, or resulted in an error.
* 
* For "onprogress" only:
* 
* @param {Boolean} lengthComputable: Whether it is currently possible to know the total size of the response.
* @param {Integer} loaded: The number of bytes loaded thus far.
* @param {Integer} total: The total size of the response.
* Returns
*/
GM_xmlhttpRequest = GM_xmlhttpRequest;




/*
 *  GM_download polyfill
 *  
 *  @description  A polyfill to make your userscript supports GM_download
 *  @author       ccloli
 *  @version      1.0
 */

// to use this polyfill, you must add "@grant GM_xmlhttpRequest" at userscript metadata block

// Original Documentation: http://tampermonkey.net/documentation.php?ext=dhdg#GM_download

if (typeof GM_download !== 'function') {
    if (typeof GM_xmlhttpRequest !== 'function') {
        throw new Error('GM_xmlhttpRequest is undefined. Please set @grant GM_xmlhttpRequest at metadata block.');
    }

    function GM_download(url, name) {
        if (url == null) return;

        var data = {
            method: 'GET',
            responseType: 'arraybuffer',

            onload: function (res) {
                var blob = new Blob([res.response], {type: 'application/octet-stream'});
                var url = URL.createObjectURL(blob); // blob url

                var a = document.createElement('a');
                a.setAttribute('href', url);
                a.setAttribute('download', data.name != null ? data.name : 'filename');
                document.documentElement.appendChild(a);

                // call download
                // a.click() or CLICK the download link can't modify filename in Firefox (why?)
                // Solution from FileSaver.js, https://github.com/eligrey/FileSaver.js/
                var e = new MouseEvent('click');
                a.dispatchEvent(e);

                document.documentElement.removeChild(a);

                setTimeout(function () {
                    // reduce memory usage
                    URL.revokeObjectURL(url);
                    if ('close' in blob) blob.close(); // File Blob.close() API, not supported by all the browser right now
                    blob = undefined;
                }, 1000);

                if (typeof data.onafterload === 'function') data.onafterload(); // call onload function
            }

            // error object of onerror function is not supported right now
        };

        if (typeof url === 'string') {
            data.url = url;
            data.name = name;
        } else {
            if (url instanceof Object === false) return;

            // as documentation, you can only use [url, name, headers, saveAs, onload, onerror] function, but we won't check them
            // Notice: saveAs is not supported
            if (url.url == null) return;

            for (var i in url) {
                if (i === 'onload') data.onafterload = url.onload; // onload function support
                else data[i] = url[i];
            }
        }

        // it returns this GM_xhr, thought not mentioned in documentation
        return GM_xmlhttpRequest(data);
    }
}


 /**
  * @param details can have the following attributes:
  * @param details.url - the URL from where the data should be downloaded
  * @param details.name - the filename - for security reasons the file extension needs to be whitelisted at Tampermonkey's options page
  * @param details.headers - see GM_xmlhttpRequest for more details
  * @param details.saveAs - boolean value, show a saveAs dialog
  * @param details.onerror callback to be executed if this download ended up with an error
  * @param details.onload callback to be executed if this download finished
  * @param details.onprogress callback to be executed if this download made some progress
  * @param details.ontimeout callback to be executed if this download failed due to a timeout
  * @param details.The download argument of the onerror callback can have the following attributes:
  * @param details.error - error reason
  * @param details.not_enabled - the download feature isn't enabled by the user
  * @param details.not_whitelisted - the requested file extension is not whitelisted
  * @param details.not_permitted - the user enabled the download feature, but did not give the downloads permission
  * @param details.not_supported - the download feature isn't supported by the browser/version
  * @param details.not_succeeded - the download wasn't started or failed, the details attribute may provide more information
  * @param details.details - detail about that error
  * @param details.Returns an object with the following property:
  * @param details.abort - function to be called to cancel this download
  */
GM_download = GM_download;
