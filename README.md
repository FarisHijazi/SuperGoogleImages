# SuperGoogle UserScript

A UserScript to add features to Google images, like: display full resolution images, zip+download all images, and more

A [UserScript](https://openuserjs.org/about/Userscript-Beginners-HOWTO#what-is-a-user-script-) to enhance Google images pages and add features.
A summary of features includes:

- Display full resolution images, instead of thumbnails! (will also play all gifs)
- `vew image` button
- Download all images on the page, (can also be zipped)

TODO: Finish project description

## Installation

1. make sure you have a UserScript client like Tampermonkey.
2. Download the following scripts, and make sure that they execute in the following order:
   1. [Google Bypass Result Page Redirect.user.js](lib/Google%20Bypass%20Result%20Page%20Redirect.user.js), [source](https://greasyfork.org/scripts/14150-google-%E7%BB%95%E8%BF%87%E6%90%9C%E7%B4%A2%E7%BB%93%E6%9E%9C%E7%BD%91%E9%A1%B5%E9%93%BE%E6%8E%A5%E9%87%8D%E5%AE%9A%E5%90%91/code/Google%EF%BC%9A%E7%BB%95%E8%BF%87%E6%90%9C%E7%B4%A2%E7%BB%93%E6%9E%9C%E7%BD%91%E9%A1%B5%E9%93%BE%E6%8E%A5%E9%87%8D%E5%AE%9A%E5%90%91.user.js)
   2. [Google Direct Links for Pages and Images.user.js](lib/Google%20Direct%20Links%20for%20Pages%20and%20Images.user.js), [source](https://greasyfork.org/scripts/19210-google-direct-links-for-pages-and-images/code/Google:%20Direct%20Links%20for%20Pages%20and%20Images.user.js)
   3. [SuperGoogle.user.js](SuperGoogle.user.js)
3. [Required for downloading only] Go to the Tampermonkey settings and change download mode to `beta`, (see how)[TODO: add url].
4. [Required for downloading only] The script also needs `@connect` permissions to connect to other domains, to do this, click `always allow` (details)[TODO: add url]. TODO: add screenshot

## Usage

Open Google.com/....
TODO: write about usage

### Features

#### Image panel added features

- ##### Display original images

    One of the most important features, replaces thumbnails with the original source images, EVEN GIFS!

- ##### Zip and download all the images

    You can even specify the minimum allowed dimensions for images

- ##### Enhance the image panels

    ![image panel screenshot](Screenshots/Screenshot_1_ImagePanel_Details.png)

  1. Add `view image` button

      Bring back the old `view image` button! Now you won't have to visit the website just to see the fullres image.

  2. `download` button

      Directly download the image

  3. **Clickable description**

        Clicking the description will take you to another search that description

  4. **Proxy** button

        Try to use a proxy if the page is blocked

  5. Click to view images with **similar dimensions**

        I really missed that feature, I wish Google

  6. Clickable *image host* text

        Click the *image host* to search google for more images from that site. For example if it was hosted by `example.com`, then clicking it would open a google image search of "`site:example.com`"

  7. `Download Related` button

        Click to download this image and all the related images (the ones on the bottom right)

  8. Clickable *page host* text

        Click the *page host* to search google for more images from that site. For example if it was hosted by `example.com`, then clicking it would open a google image search of "`site:example.com`"

TODO: continue listing features

### Hotkeys

TODO: list hotkeys

## External Libraries

TODO: list the used libraries and link to the sources

## Documentation

TODO: Depending on the size of the project, if it is small and simple enough the reference docs can be added to the README.
For medium size to larger projects it is important to at least provide a link to where the API reference docs live.

## Contributing

- Fork it!
- Create your feature branch: `git checkout -b my-new-feature`
- Commit your changes: `git commit -am 'Add some feature'`
- Push to the branch: `git push origin my-new-feature`
- Submit a pull request!

## License

TODO: Write license
