const pattern = String.raw;
console.log(pattern, pattern.length);
const re = new RegExp(pattern);
console.log('regex', re.test('\alpha'));
