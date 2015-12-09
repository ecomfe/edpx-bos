bos
---------
### Usage

    edp bos <file> bos://<bucket>/<this/is/the/target>
    edp bos <dir> bos://<bucket>/mydir

### Description

使用`bos`存储静态文件的资源，支持上传单个文件或者目录.

使用之前需要设置三个参数：

    edp config bos.ak <ak>
    edp config bos.sk <sk>
    edp config bos.endpoint <endpoint>

默认只上传小于10M的文件，如果需要放宽这个限制，可以添加`max-size`参数，例如：

    edp bos <file> bos://<bucket>/mydir --max-size=20m

如果需要自动对上传的文件名进行编码，需要添加`auto-uri`参数。

    edp bos <file> bos://<bucket>/mydir --max-size=20m --auto-uri
