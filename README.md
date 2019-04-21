# SuperGoogle for Google Images

- [SuperGoogle for Google Images](#supergoogle-for-google-images)
  - [Description](#description)
  - [Installation](#installation)
  - [Usage](#usage)
    - [Hotkeys](#hotkeys)
  - [Features](#features)
    - [Display original images](#display-original-images)
    - [Zip and download all the images](#zip-and-download-all-the-images)
    - [Enhance the image panels](#enhance-the-image-panels)
  - [External Libraries](#external-libraries)
  - [Documentation](#documentation)
  - [Contributing](#contributing)
  - [License](#license)

## Description

A [UserScript](https://openuserjs.org/about/Userscript-Beginners-HOWTO) to add features to Google images, like:  
display full resolution images, zip+download all images, and more. See a list of [all features here](#Features);

## Installation

### Userscript (Tampermonkey)

1. make sure you have a UserScript client like Tampermonkey.
2. [Download](https://github.com/FarisHijazi/SuperGoogle/raw/master/SuperGoogle.user.js) or visit the RAW file url.
3. [Required only for downloading] Go to the Tampermonkey settings and change download mode to `Browser API`, (see how)[TODO: add url].
    > Tampermonkey dashboard (by clicking the icon) > Downloads BETA > Download Mode: > Browser API > Save
4. [Required only for downloading] The script also needs `@connect` permissions to connect to other domains, to do this, click `always allow` (details)[TODO: add url]. TODO: add screenshot

### Browser extension

//

Not yet supported, but coming soon!

//

## Usage

Open Google.com/....
TODO: write about usage

Below is a list of the available features, listed from what is (probably) most useful.

### Display original images

One of the most important features, replaces thumbnails with the original source images, even GIFs!

### Zip and download all the images

You can even specify the minimum allowed dimensions for images

### Enhance the image panels

Adds the following features to the image panel:

![image panel screenshot](Screenshots/Screenshot_1_ImagePanel_Details.png)

- 1 - Add `view image` button

    Bring back the old `view image` button! Now you won't have to visit the website just to see the fullres image.

- 2 - `download` button

    Directly download the image

- 3 - **Clickable description**

    Lookup the description text, open another Google images page searching for the description text

- 4 - **Proxy** button

    Try to use a proxy if the page is blocked

- 5 - Click to view images with **similar dimensions**

    I really missed this feature when Google removed it

- 6 - Clickable *image host* text

    Click the *image host* to search google for more images from that site. For example if it was hosted by `example.com`, then clicking it would open a google image search of "`site:example.com`"

- 7 - `Download Related` button

    Click to download this image and all the related images (the ones on the bottom right)

- 8 - Clickable *page host* text

    Click the *page host* to search google for more images from that site. For example if it was hosted by `example.com`, then clicking it would open a google image search of "`site:example.com`"

TODO: continue listing features

### Hotkeys

TODO: list hotkeys

## External Libraries

This script does use several other external libraries and scripts, they will be listed below with links to their sources.

Scripts

- [Google Direct Links for Pages and Images.user.js](lib/Google%20Direct%20Links%20for%20Pages%20and%20Images.user.js), [source](https://greasyfork.org/scripts/19210-google-direct-links-for-pages-and-images/code/Google:%20Direct%20Links%20for%20Pages%20and%20Images.user.js)

Libraries

- [jQuery](https://jquery.com/)
- [Mousetrap.js](https://github.com/ccampbell/mousetrap) keybindings
- [progressbar.js](https://github.com/kimmobrunfeldt/progressbar.js/) progress bar when downloading
- [JSZip](https://github.com/Stuk/jszip) zip and compress functionality

## Documentation

TODO: Add documentation

## Contributing

- Fork it!
- Create your feature branch: `git checkout -b my-new-feature`
- Commit your changes: `git commit -am 'Add some feature'`
- Push to the branch: `git push origin my-new-feature`
- Submit a pull request!

## License

[Apache License](LICENSE.md)  
Version 2.0, January 2004
