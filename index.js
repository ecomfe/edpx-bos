/**
 * @file 上传文件到bos
 * @author leeight(liyubei@baidu.com)
 * @author wangyisheng@outlook.com (easonyq)
 **/

var edp = require('edp-core');
var config = require('edp-config');

var bos = require('./lib/sdk');

/**
 * 获取最大文件大小的数字表示
 *
 * @param {Object} opts 命令行参数.
 * @return {number}
 */
exports.getMaxSize = function (opts) {
    var maxSize = opts['max-size'];
    if (!maxSize) {
        maxSize = 10 * 1024 * 1024;   // 10M
    }
    else {
        var msptn = /^([\d\.]+)([mk])?/i;
        var match = maxSize.match(msptn);
        if (!match) {
            edp.log.error('Invalid arguments: %s', maxSize);
            process.exit(1);
        }

        maxSize = parseInt(match[1], 10);
        var unit = match[2];
        if (unit === 'm' || unit === 'M') {
            maxSize = maxSize * (1024 * 1024);
        }
        else if (unit === 'k' || unit === 'K') {
            maxSize = maxSize * (1024);
        }

        if (!maxSize) {
            maxSize = 10 * 1024 * 1024;
        }
    }

    return maxSize;
};

/**
 * 主入口
 *
 * @param {Array.<string>} args 命令行参数.
 * @param {Object.<string, string>} opts 命令的可选参数
 * @return {Object} Deferred对象
 */
exports.start = function (args, opts) {
    var file = args[0];
    if (!file || args.length !== 2) {
        edp.log.error('Invalid arguments');
        process.exit(1);
    }

    var maxSize = exports.getMaxSize(opts);

    var bktptn = /^bos:\/\/([^\/]+)(.*)?$/;
    var match = args[1].match(bktptn);
    if (!match) {
        edp.log.error('Invalid arguments: %s', args[1]);
        process.exit(1);
    }

    var bucket = match[1];
    var target = (match[2] || '').replace(/^\/+/, '');

    var fs = require('fs');
    if (!fs.existsSync(file)) {
        edp.log.error('No such file or directory = [%s]', file);
        process.exit(1);
    }

    var ak = config.get('bos.' + bucket + '.ak') || config.get('bos.ak');
    var sk = config.get('bos.' + bucket + '.sk') || config.get('bos.sk');
    var endpoint = config.get('bos.endpoint');
    if (!ak || !sk || !endpoint) {
        edp.log.warn('Please set `bos.ak`, `bos.sk` and `bos.endpoint` first.');
        edp.log.warn('You can apply them from http://bce.baidu.com/index.html');
        process.exit(1);
    }

    var autoUri = !!opts['auto-uri'];

    var sdk = new bos.BaiduObjectStorage(ak, sk, endpoint, maxSize, autoUri);
    return sdk.upload(bucket, file, target);
};

exports.sdk = bos;
