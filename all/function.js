const _0x1a = require('moment-timezone')
const _0x2b = require('util')
const _0x3c = require('fs')
const _0x4d = require('form-data')
const _0x5e = require('axios')
const _0x6f = require('cheerio')
const _0x7g = require('jimp')

exports.getRandom = (_0x8h) => {
    return `${Math.floor(Math.random() * 10000)}${_0x8h}`
}

exports.ucapan = () => {
  const _0x9i = _0x1a().tz('Africa/Lagos')
  const _0x10j = _0x9i.hour()
  let _0x11k
  if (_0x10j >= 5 && _0x10j < 12) {
    _0x11k = 'GooD Morning 🌅'
  } else if (_0x10j >= 12 && _0x10j < 15) {
    _0x11k = 'Good Afternoon 🌇'
  } else if (_0x10j >= 15 && _0x10j < 18) {
    _0x11k = 'Good evening 🌄'
  } else {
    _0x11k = 'Good Night 🌃'
  }
  return _0x11k
}

exports.generateProfilePicture = async (_0x12l) => {
	const _0x13m = await _0x7g.read(_0x12l)
	const _0x14n = _0x13m.getWidth()
	const _0x15o = _0x13m.getHeight()
	const _0x16p = _0x13m.crop(0, 0, _0x14n, _0x15o)
	return {
		img: await _0x16p.scaleToFit(720, 720).getBufferAsync(_0x7g.MIME_JPEG),
		preview: await _0x16p.scaleToFit(720, 720).getBufferAsync(_0x7g.MIME_JPEG)
	}
}

exports.getTime = (_0x17q, _0x18r) => {
	if (_0x18r) {
		return _0x1a(_0x18r).locale('id').format(_0x17q)
	} else {
		return _0x1a.tz('Africa/Lagos').locale('id').format(_0x17q)
	}
}

exports.getBuffer = async (_0x19s, _0x20t) => {
	try {
		_0x20t ? _0x20t : {}
		const _0x21u = await _0x5e({
			method: "get",
			url: _0x19s,
			headers: {
				'DNT': 1,
				'Upgrade-Insecure-Request': 1
			},
			..._0x20t,
			responseType: 'arraybuffer'
		})
		return _0x21u.data
	} catch (_0x22v) {
		return _0x22v
	}
}

exports.fetchJson = async (_0x23w, _0x24x) => {
    try {
        _0x24x ? _0x24x : {}
        const _0x25y = await _0x5e({
            method: 'GET',
            url: _0x23w,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
            },
            ..._0x24x
        })
        return _0x25y.data
    } catch (_0x26z) {
        return _0x26z
    }
}

exports.runtime = function(_0x27a) {
	_0x27a = Number(_0x27a);
	var _0x28b = Math.floor(_0x27a / (3600 * 24));
	var _0x29c = Math.floor(_0x27a % (3600 * 24) / 3600);
	var _0x30d = Math.floor(_0x27a % 3600 / 60);
	var _0x31e = Math.floor(_0x27a % 60);
	var _0x32f = _0x28b > 0 ? _0x28b + (_0x28b == 1 ? " Day, " : " Day, ") : "";
	var _0x33g = _0x29c > 0 ? _0x29c + (_0x29c == 1 ? " Hour, " : " Hour, ") : "";
	var _0x34h = _0x30d > 0 ? _0x30d + (_0x30d == 1 ? " Minute, " : " Minute, ") : "";
	var _0x35i = _0x31e > 0 ? _0x31e + (_0x31e == 1 ? " Seconds" : " Seconds") : "";
	return _0x32f + _0x33g + _0x34h + _0x35i;
}

exports.tanggal = function(_0x36j) {
	_0x37k = ["1","2","3","4","5","6","7","8","9","10","11","12"];
	_0x38l = ['Sunday','monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; 
	var _0x39m = new Date(_0x36j);
	var _0x40n = _0x39m.getDate()
	_0x41o = _0x39m.getMonth()
	var _0x42p = _0x39m.getDay(),
	_0x42p = _0x38l[_0x42p];
	var _0x43q = _0x39m.getYear()
	var _0x44r = (_0x43q < 1000) ? _0x43q + 1900 : _0x43q; 
	const _0x45s = _0x1a.tz('Africa/Lagos').format('DD/MM HH:mm:ss')
	let _0x46t = new Date
	let _0x47u = 'id'
	let _0x48v = new Date(0).getTime() - new Date('1 January 1970').getTime()
	let _0x49w = ['Pahing', 'Pon','Wage','Kliwon','Legi'][Math.floor((( _0x46t * 1) + _0x48v) / 84600000) % 5]
	
	return`${_0x42p}, ${_0x40n}/${_0x37k[_0x41o]}/${_0x44r}`
}

exports.toRupiah = function(_0x50x){
_0x50x = _0x50x.toString()
var _0x51y = /(-?\d+)(\d{3})/
while (_0x51y.test(_0x50x))
_0x50x = _0x50x.replace(_0x51y, "$1.$2")
return _0x50x
}

exports.telegraPh = async (_0x52z) => {
	return new Promise (async (_0x53a, _0x54b) => {
		if (!_0x3c.existsSync(_0x52z)) return _0x54b(new Error("File not Found"))
		try {
			const _0x55c = new _0x4d();
			_0x55c.append("file", _0x3c.createReadStream(_0x52z))
			const _0x56d = await _0x5e({
				url: "https://telegra.ph/upload",
				method: "POST",
				headers: {
					..._0x55c.getHeaders()
				},
				data: _0x55c
			})
			return _0x53a("https://telegra.ph" + _0x56d.data[0].src)
		} catch (_0x57e) {
			return _0x54b(new Error(String(_0x57e)))
		}
	})
}

exports.pinterest = function (_0x58f) {
  return new Promise(async (_0x59g, _0x60h) => {
    _0x5e
      .get("https://id.pinterest.com/search/pins/?autologin=true&q=" + _0x58f, {
        headers: {
          cookie:
            '_auth=1; _b="AVna7S1p7l1C5I9u0+nR3YzijpvXOPc6d09SyCzO+DcwpersQH36SmGiYfymBKhZcGg="; _pinterest_sess=TWc9PSZHamJOZ0JobUFiSEpSN3Z4a2NsMk9wZ3gxL1NSc2k2NkFLaUw5bVY5cXR5alZHR0gxY2h2MVZDZlNQalNpUUJFRVR5L3NlYy9JZkthekp3bHo5bXFuaFZzVHJFMnkrR3lTbm56U3YvQXBBTW96VUgzVUhuK1Z4VURGKzczUi9hNHdDeTJ5Y2pBTmxhc2owZ2hkSGlDemtUSnYvVXh5dDNkaDN3TjZCTk8ycTdHRHVsOFg2b2NQWCtpOWxqeDNjNkk3cS85MkhhSklSb0hwTnZvZVFyZmJEUllwbG9UVnpCYVNTRzZxOXNJcmduOVc4aURtM3NtRFo3STlmWjJvSjlWTU5ITzg0VUg1NGhOTEZzME9SNFNhVWJRWjRJK3pGMFA4Q3UvcHBnWHdaYXZpa2FUNkx6Z3RNQjEzTFJEOHZoaHRvazc1c1UrYlRuUmdKcDg3ZEY4cjNtZlBLRTRBZjNYK0lPTXZJTzQ5dU8ybDdVS015bWJKT0tjTWYyRlBzclpiamdsNmtpeUZnRjlwVGJXUmdOMXdTUkFHRWloVjBMR0JlTE5YcmhxVHdoNzFHbDZ0YmFHZ1VLQXU1QnpkM1FqUTNMTnhYb3VKeDVGbnhNSkdkNXFSMXQybjRGL3pyZXRLR0ZTc0xHZ0JvbTJCNnAzQzE0cW1WTndIK0trY05HV1gxS09NRktadnFCSDR2YzBoWmRiUGZiWXFQNjcwWmZhaDZQRm1UbzNxc21pV1p5WDlabm1UWGQzanc1SGlrZXB1bDVDWXQvUis3elN2SVFDbm1DSVE5Z0d4YW1sa2hsSkZJb1h0MTFpck5BdDR0d0lZOW1Pa2RDVzNySWpXWmUwOUFhQmFSVUpaOFQ3WlhOQldNMkExeDIvMjZHeXdnNjdMYWdiQUhUSEFBUlhUVTdBMThRRmh1ekJMYWZ2YTJkNlg0cmFCdnU2WEpwcXlPOVZYcGNhNkZDd051S3lGZmo0eHV0ZE42NW8xRm5aRWpoQnNKNnNlSGFad1MzOHNkdWtER0xQTFN5Z3lmRERsZnZWWE5CZEJneVRlMDd2VmNPMjloK0g5eCswZUVJTS9CRkFweHc5RUh6K1JocGN6clc1JmZtL3JhRE1sc0NMTFlpMVErRGtPcllvTGdldz0=; _ir=0',
        },
      })
      .then(({ data: _0x61i }) => {
        const _0x62j = _0x6f.load(_0x61i),
          _0x63k = [],
          _0x64l = [];
        _0x62j("div > a")
          .get()
          .map((_0x65m) => {
            const _0x66n = _0x62j(_0x65m).find("img").attr("src");
            _0x63k.push(_0x66n);
          }),
          _0x63k.forEach((_0x67o) => {
            null != _0x67o && _0x64l.push(_0x67o.replace(/236/g, "736"));
          }),
          _0x64l.shift(),
          _0x59g(_0x64l);
      });
  });
}
