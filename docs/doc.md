# Documentation

Things related to how the code works can be found here

## parsing the search text

regex:

```js
re = /(\w*)(\s|^)(site:)?(\w+:\/\/)*([\w.]+)([\w.\/]*)([^\s]*)\s?(.*)/
```

example search text:

```txt
sfm site:https://tumbex.com/user/someuser/picture.jpg?&f=5 bekfast
```

Used [regex101.com](https://regex101.com/r/gq9In1/7)

| Group   | description   | partial string                                                                    |
| ------- | ------------- | --------------------------------------------------------------------------------- |
| Full    |               | "sfm site:https://www.host.tumbex.com/user/someuser/picture.jpg?&f=5 bekfast" |
| Group 1 | "left query"  | "sfm"                                                                             |
| Group 2 |               |                                                                                   |
| Group 3 | "site:"       | "site:"                                                                           |
| Group 4 | "protocol"    | "https://"                                                                        |
| Group 5 | "hostname"    | "www.host.tumbex.com"                                                             |
| Group 6 | "path"        | "/user/someuser/picture.jpg"                                                      |
| Group 7 | "urlparams"   | "?&f=5"                                                                           |
| Group 8 | "right query" | "bekfast"                                                                     |

```js
const regex = /(\w*)(\s|^)(site:)?(\w+:\/\/)*([\w.]+)([\w.\/]*)([^\s]*)\s?(.*)/;
const str = `sfm site:https://host.tumbex.com/user/someuser/picture.jpg?&f=5 bekfast`;
let m;
if ((m = regex.exec(str)) !== null) {
    const groupsObj = {
        'match': m,
        'leftQuery': m[1],
        'siteStr': m[3],
        'protocol': m[4],
        'hostname': m[5],
        'path': m[6],
        'urlParams': m[7],
        'rightQuery': m[8],
    }
}
```
