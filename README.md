# SuperGoogle for Google Images

A [UserScript](https://openuserjs.org/about/Userscript-Beginners-HOWTO) to add features to Google images, like:  
display full resolution images, zip+download all images, and more. See a list of [all features here](#Features);

## Installation

1. make sure you have a UserScript client like Tampermonkey.
2. [Download](https://github.com/FarisHijazi/SuperGoogle/raw/master/SuperGoogle.user.js) or visit the RAW file url.
3. [Required only for downloading] Go to the Tampermonkey settings and change download mode to `beta`, (see how)[TODO: add url].
4. [Required only for downloading] The script also needs `@connect` permissions to connect to other domains, to do this, click `always allow` (details)[TODO: add url]. TODO: add screenshot

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
