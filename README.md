# SuperGoogle: a browser addon for Google Images

<!-- <a href="" target="_blank"><img alt="chrome-icon" src="https://imgur.com/3C4iKO0.png" width="64" height="64"></a> -->
<!-- <a href="" target="_blank"><img alt="firefox-icon" src="https://imgur.com/Dy442GK.png" width="64" height="64"></a>
<a href="" target="_blank"><img alt="edge-icon" src="https://imgur.com/RlmwPGO.png" width="64" height="64"></a>
<a href="" target="_blank"><img alt="opera-icon" src="https://imgur.com/nSJ9htU.png" width="64" height="64"></a>
<a href="" target="_blank"><img alt="safari-icon" src="https://imgur.com/ENbaWUu.png" width="64" height="64"></a>
<a href="" target="_blank"><img alt="webbrowser-icon" src="https://imgur.com/EuDp4vP.png" width="64" height="64"></a>
<a href="" target="_blank"><img alt="brave-icon" src="https://imgur.com/z8yjLZ2.png" width="64" height="64"></a>
<a href="" target="_blank"><img alt="torr-icon" src="https://imgur.com/uhb8M86.png" width="64" height="64"></a> -->

A browser-plugin/[script](https://openuserjs.org/about/Userscript-Beginners-HOWTO) to add features to [Google images](https://www.google.com/search?q=example&tbm=isch&safe=strict).

**Status:** very clunky and will be re-written soon

Another similar and promising project is [ViewImage](https://github.com/bijij/ViewImage)

<div align='center'>
     <a href = 'https://youtu.be/ceFuBh8r8GQ?t=24'>
     Watch demo video<br>
        <img src = './Screenshots/Screenshot_imageBoxes_playing_GIFs.gif' alt = 'Click to go to YouTube!' max-height = '400px'>
     </a>
</div>

## Key features:

- **Download all full quality images** in a single click (as zip or individually)
- **Bring back the old `view image`** button! (Now you won't have to visit the website just to see the fullres image)
- Add **`download` button** Directly download the image
- **Replace thumbnails** with full resolution images. (also animates all GIFs)
- replace google **redirect links**

[All features](#Features)

-----

Table of contents:

- [SuperGoogle: a browser addon for Google Images](#supergoogle-a-browser-addon-for-google-images)
  - [Key features:](#key-features)
  - [Installation](#installation)
    - [UserScript (Tampermonkey)](#userscript-tampermonkey)
    - [Browser extension](#browser-extension)
  - [Usage](#usage)
    - [Download all the images](#download-all-the-images)
    - [Display original images](#display-original-images)
    - [Enhance the image panels](#enhance-the-image-panels)
    - [Hotkeys](#hotkeys)
  - [Documentation](#documentation)
  - [Logs](#logs)
    - [Dec-2019 backend update](#dec-2019-backend-update)
      - [Notes and observations:](#notes-and-observations)
  - [External Libraries](#external-libraries)
    - [Libraries](#libraries)
  - [Contributing](#contributing)
  - [License](#license)

## Installation

### UserScript ([Tampermonkey](install:tampermonkey-chrome))

1. Install [Tampermonkey](install:tampermonkey-chrome) for your browser (or any [UserScript client][guide:get-user-script]).
2. Click [DOWNLOAD][download-link] (or visit the RAW file url).
3.  <details>
    <summary>Allow downlaods. (Optional) <i>(Click to expand)</i></summary>
    <ul>
    <li>
    <a href="https://www.tampermonkey.net/faq.php#Q302">Enable <code>Browser API</code>.
      <br>
      <img alt="enable browser API beta" src="https://www.tampermonkey.net/images/animated/gm_download.gif">
    </a>
    <br>
    <ul>
      <li>Go to the Tampermonkey options page</li>
      <li>Scroll down to the <i>Downloads</i> section</li>
      <li>Double-check the <i>Whitelisted File Extensions</i> setting to not contain file extensions of executable files</li>
      <li>Select <i>Browser API</i> at the <i>Download Mode</i> option</li>
      <li>A notification may come up, you need to click at it and to click <i>confirm</i> at the permission grant dialog</li>
    </ul>
    </li>
    <li>When prompted, allow the script to load images, click <code>Always allow all domains</code> (only needed once).<br> <img src="./Screenshots/Screenshot_tampermonkey_allow_connect.png" alt="allow connect permissions" width="250"></li>
    </ul>
    </details>
4. Open any [google image search page](https://www.google.com/search?q=example&tbm=isch&safe=strict) and enjoy the enhanced experience

### Browser extension

Not yet supported, but coming soon!

## Usage

Below is a list of the available features, sorted by *most useful first*.

### Download all the images

You can download all the loaded images as a zip file or indipendantly *(although this option is not advised due to it causing crashes)*.  
You can even specify the minimum dimension for images using the sliders (to only download large images for example).

### Display original images

One of the most important features, replaces thumbnails with the original source images, even GIFs!

![original images](./Screenshots/Screenshot_imageBoxes_playing_GIFs.gif)

### Enhance the image panels

Adds the following features to the image panel:

![image panel screenshot](./Screenshots/Screenshot_1_ImagePanel_Details.png)

- 1 - Add `view image` button

    Bring back the old `view image` button! Now you won't have to visit the website just to see the fullres image.

- 2 - `download` button

    Directly download the image

- 3 - Clickable description

    Lookup the description text, open another Google images page searching for the description text

<!-- - 5 - Click to view images with **similar dimensions**

    I really missed this feature when Google removed it -->

- 6 - Clickable *image host* text

    Click the *image host* to search google for more images from that site. For example if it was hosted by `example.com`, then clicking it would open a google image search of "`site:example.com`"

- 7 - `Download Related` button

    Click to download this image and all the related images (the ones on the bottom right)

<!-- - 8 - Clickable *page host* text

    Click the *page host* to search google for more images from that site. For example if it was hosted by `example.com`, then clicking it would open a google image search of "`site:example.com`" -->

<!-- TODO: continue listing features -->

### Hotkeys

<!-- TODO: list hotkeys -->

Global hotkeys

| Hotkey | Action                                            |
| ------ | ------------------------------------------------- |
| O O    | Enable display original images                    |
| s s    | Force disable safe search (using ipv4.google.com) |

Panel-specific (hotkeys that work for an image panel when it is open)

| Hotkey    | Action                                    |
| --------- | ----------------------------------------- |
| o         | Display original images for current panel |
| UpArrow   | Go to previous related image              |
| DownArrow | Go to next related image                  |
| b         | search **b**y image                       |
|           |                                           |

## Documentation

- The [docs](docs/doc.md) file contains info about the code and any complicated parts.
- The [reverse engineering](docs\ReverseEngineering.md) contains info about how the website works and the main components it contains (based on observations), such as the CSS selectors for the panels and components, where the info is kept in the page, where thumbnails are loaded and where main images are.

## Logs

### Dec-2019 backend update

Google changed their webpage HTML AGAIN! :(
And now the images aren't in `.rg_meta`, they're hidden somewhere deep in an array, this is called [json transpose](https://codesandbox.io/s/vue-json-transpose-dt915?from-embed).
And also the CSS selectors for the elements have been changed, they used to make sense but now they're just gibberish.

#### Notes and observations:

- so many anchor.href === "https://www.google.com/null"
  Reason was that `3361: return normalizeUrl(this.getAttribute('href'));` href was null, and normalizeUrl was forcing it to be a string.
- I noticed that when you right-click, you get the correct URL, but when running `showImages()`, the anchor.href is null.
- pretty much all the google functions are inside an object called `_`
- clicking the images all the time causes issues. Such as unresponsiveness, ruining the panels (all 3)

Issues to fix:

- [x] select image slider isn't selecting the images. none are qualified for some reason.
    - the reason is that the width and height are not in the `meta` object
- [x] related images don't have onhoverListeners
- [ ] the download buttons don't get the right name when downloading
- [ ] there is some null text on the top left corner
- [ ] hovering over related images doesn't do anything anymore

Actions that must be taken:
- [x] image null URLs are turning into "null" strings, this must be stopped. the anchor is having a null href, that's one of the reasons
- [ ] update selectors
  - [ ] should put them all in `Consts.Selectors`
  - [ ] navbar
  - [x] image boxes
  - [ ] images
- [ ] get image meta info. (This is from the script json transpose)
  - [ ] get info for image boxes
  - [ ] git info for related images
- panels
  - [ ] fix download button (it)

## External Libraries

This script does use several other external libraries and scripts, they will be listed below with links to their sources.

Scripts

- [Google Direct Links for Pages and Images.user.js](lib/Google%20Direct%20Links%20for%20Pages%20and%20Images.user.js), [[source]](https://greasyfork.org/scripts/19210-google-direct-links-for-pages-and-images/code/Google:%20Direct%20Links%20for%20Pages%20and%20Images.user.js)

### Libraries

- [jQuery](https://jquery.com/)
- [Mousetrap.js](https://github.com/ccampbell/mousetrap) keybindings
- [progressbar.js](https://github.com/kimmobrunfeldt/progressbar.js/) progress bar when downloading
- [JSZip](https://github.com/Stuk/jszip) zip and compress functionality

## Contributing

- Fork it!
- Create your feature branch: `git checkout -b my-new-feature`
- Commit your changes: `git commit -am 'Add some feature'`
- Push to the branch: `git push origin my-new-feature`
- Submit a pull request!

## License

[Apache License](LICENSE.md)  
Version 2.0, January 2004

[guide:get-user-script]: https://openuserjs.org/about/Userscript-Beginners-HOWTO#how-do-i-get-going-
[guide:userscript]: https://simply-how.com/enhance-and-fine-tune-any-web-page-the-complete-user-scripts-guide#section-2
[guide:browser-API-beta]: https://www.tampermonkey.net/faq.php#Q302
[guide:browser-API-beta-gif]: https://www.tampermonkey.net/images/animated/gm_download.gif
[download-link]: https://github.com/FarisHijazi/SuperGoogle/raw/master/SuperGoogle.user.js
[install:tampermonkey-chrome]: https://www.tampermonkey.net/index.php?ext=dhdg&browser=chrome

[chrome-icon]: https://imgur.com/3C4iKO0.png
[firefox-icon]: https://imgur.com/Dy442GK.png
[edge-icon]: https://imgur.com/RlmwPGO.png
[opera-icon]: https://imgur.com/nSJ9htU.png
[safari-icon]: https://imgur.com/ENbaWUu.png
[webbrowser-icon]: https://imgur.com/EuDp4vP.png
[brave-icon]: https://imgur.com/z8yjLZ2.png
[torr-icon]: https://imgur.com/uhb8M86.png
