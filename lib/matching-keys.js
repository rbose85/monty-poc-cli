const matchKey = (obj, re = /^_/, path = '') => {
  Object.keys(obj)
    .map(key => {
      if (obj.hasOwnProperty(key)) {
        const _path = path ? path + '.' + key : key

        console.log('\n--rb-- _path:', _path, '--\n') // eslint-disable-line no-console

        if (typeof obj[key] === 'object') {
          return matchKey(obj[key], re, _path)
        }

        console.log('\t re:', re, ' typeof: ', typeof re, ' regex:', re instanceof RegExp, ' key:', key)
        if (re.test(key)) {
          console.log('\t Y E S')
          return _path
        }
      }
    })
}

export default matchKey
