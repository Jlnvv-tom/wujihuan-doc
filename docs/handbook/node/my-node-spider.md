# node 爬虫试探

## 安装依赖

```javascript
// package.json

{
  "name": "my-node-spider",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "serve": "node app.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "cheerio": "^1.0.0-rc.12",
    "express": "^4.18.2",
    "mkdirp": "^2.1.5",
    "request": "^2.88.2",
    "superagent": "^8.0.9",
    "superagent-charset": "^1.2.0"
  }
}

```

## app.js 文件
```javaScript
// app.js

const express = require('express');
const superagent = require('superagent');
const charset = require('superagent-charset');
charset(superagent);
const baseUrl = 'https://www.qqtn.com/'; //输入爬取的地址
const cheerio = require('cheerio');
const app = express();
const path = require('path');
const fs = require('fs');
const request = require('request');
// const { mkdirp } = require('mkdirp');
const dir = path.join(__dirname, '/images/');
// mkdirp(dir).then(made =>
//   console.log(`made directories, starting with ${made}`)
// )
let url_arr = [];
console.log(`output->__dirname`, __dirname, dir)

app.get('/index', function (req, res) {
  //设置请求头
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  //类型
  console.log(`output->req`,req)
  let type = req.query.type;
  //页码
  let page = req.query.page;
  type = type || 'nvsheng';
  page = page || '2';
  let route = `tx/${type}tx_${page}.html`
  //网页页面信息是gb2312，所以chaeset应该为.charset('gb2312')，一般网页则为utf-8,可以直接使用.charset('utf-8')
  superagent.get(baseUrl + route)
    .charset('gb2312')
    .end(function (err, sres) {
      let items = [];
      if (err) {
        console.log('ERR: ' + err);
        res.json({ code: 400, msg: err, sets: items });
        return;
      }
      // console.log(`output->sres`,sres)
      let $ = cheerio.load(sres.text);
      $('div.g-main-bg ul.g-gxlist-imgbox li a').each(function (idx, element) {
        let $element = $(element);
        let $subElement = $element.find('img');
        let thumbImgSrc = $subElement.attr('src');
        // url_arr.push(thumbImgSrc);
        items.push({
          title: $(element).attr('title'),
          href: $element.attr('href'),
          thumbSrc: thumbImgSrc
        });
      });
      url_arr = items.map(item => item.thumbSrc)
      console.log(`output->url_arr`, url_arr)

      url_arr.map((val, index) => {
        download(val, dir, 'img-' + 1 + index + '.jpg')
      })
      res.json({ code: 200, msg: "", data: items });
    });
});
const download = async (url, dir, filename) => {
  request.head(url, (err, res, body) => {
    request(url).pipe(fs.createWriteStream(dir + '/' + filename))
  })
}

// setTimeout(() => {
//   url_arr.map((val, index) => {
//     console.log(`output->url_arr`, val)
//     download(val, dir, 'img' + index)
//   })
// }, 1000);

let server = app.listen(8081, function () {
  let host = server.address().address
  let port = server.address().port
  console.log("应用实例已启动，访问地址为 http://%s:%s", host, port)

})

```

## 启动
```
npm run serve
```