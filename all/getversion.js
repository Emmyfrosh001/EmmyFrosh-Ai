const _0x4f2a = ['\x6a\x73\x6f\x6e', '\x74\x61\x67\x5f\x6e\x61\x6d\x65', '\x72\x65\x70\x6c\x61\x63\x65', '\x68\x74\x74\x70\x73\x3a\x2f\x2f\x61\x70\x69\x2e\x67\x69\x74\x68\x75\x62\x2e\x63\x6f\x6d\x2f\x72\x65\x70\x6f\x73\x2f\x54\x72\x69\x73\x74\x61\x6e\x43\x61\x67\x65\x2f\x4f\x7a\x65\x62\x61\x2d\x58\x64\x2f\x72\x65\x6c\x65\x61\x73\x65\x73\x2f\x6c\x61\x74\x65\x73\x74', '\x6f\x6b'];
const _0x2b1c = function(_0x52a1eb, _0x4f2ae4) {
  _0x52a1eb = _0x52a1eb - 0x0;
  let _0x2b1c67 = _0x4f2a[_0x52a1eb];
  return _0x2b1c67;
};

module.exports = async function getLatestGitHubVersion() {
  try {
    const _0x1a2b3c = await fetch(_0x2b1c('0x3'));
    if (!_0x1a2b3c[_0x2b1c('0x4')]) return null;
    
    const _0x4c3b2a = await _0x1a2b3c[_0x2b1c('0x0')]();
    return _0x4c3b2a[_0x2b1c('0x1')]?.[0x2b1c('0x2')](/^v/, "") || null;
  } catch (_0x5f2e1d) {
    return null;
  }
};
