/**
 * @file 测试主入口
 * @author wangyisheng@baidu.com (wangyisheng)
 **/

var sdk = require('../index');
var path = require('path');

sdk.start(
    [
        path.join(__dirname, './data/1.txt'),
        'bos://npmjs/test/edp/bos'
    ],
    {}
);

sdk.start(
    [
        path.join(__dirname, './data/2.txt'),
        'bos://npmjs/test/edp/bos'
    ],
    {
        'auto-uri': true
    }
);

sdk.start(
    [
        path.join(__dirname, './data/dir'),
        'bos://movie/test/edp/bos'
    ],
    {}
);

sdk.start(
    [
        path.join(__dirname, './data/dir'),
        'bos://movie/test/edp/bos'
    ],
    {
        'auto-uri': true
    }
);
