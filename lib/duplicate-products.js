const request = request('superagent')

const log = console.log     // eslint-disable-line no-console
const error = console.error // eslint-disable-line no-console

const getRequest = querystring => request
  .get('')
  .query(querystring)
  .set('Content-Type', 'application/json')
  .set('Arcadia-Api-Key', '')
  .accept('application/json')

const getProductsPageCount = function getCount(cat, subcat) {
  return new Promise((resolve, reject) => {
    getRequest(`category=${cat},${subcat}`)
      .end((err, res) => {
        if (err) reject(err)
        if (res.statusCode >= 200 && res.statusCode <= 299) {
          resolve(Math.ceil(res.body.paging.total / res.body.paging.pageSize))
        } else {
          reject(res.body)
        }
      })
  })
}

const getProducts = function getPage(cat, subcat, page = 1) {
  return new Promise((resolve, reject) => {
    getRequest(`category=${cat},${subcat}&currentPage=${page}`)
      .end((err, res) => {
        if (err) reject(err)
        if (res.statusCode >= 200 && res.statusCode <= 299) {
          resolve(res.body.products)
        } else {
          reject(res.body)
        }
      })
  })
}

exports.launcher = async function launcher() {
  const category = 203984
  const subCategory = 208524

  const uniques = {}
  const repeats = {}
  let pageCount = 0
  let totalPageCount


  try {
    totalPageCount = await getProductsPageCount(category, subCategory)
    log('\n\n\ttotalPageCount:', totalPageCount, '\n\n')
  } catch (e) {
    error(e.response.error || e)
    throw e
  }


  while (pageCount < totalPageCount) {
    let products

    try {
      products = await getProducts(category, subCategory, ++pageCount)
    } catch (e) {
      error(e.response.error || e)
      throw e
    }

    products
      .map(product => ({
        id: product.productId,
        info: {
          lineNo: product.lineNumber,
          name: product.name,
          imageUrl: product.assets[0].url
        }
      }))
      .map(product => {
        if (uniques.hasOwnProperty(product.id)) {
          repeats[product.id] = product.info
        } else {
          uniques[product.id] = product.info
        }

        return product
      })

    log(
      '--',
      'uniques:', Object.keys(uniques).length,
      'repeats:', Object.keys(repeats).length,
      'pageIdx:', pageCount,
      '--\n'
    )
  }

  log('\n\n--')
  for (const repeat in repeats) {
    if (repeats.hasOwnProperty(repeat)) {
      log(
        'repeats:', JSON.stringify(repeat), ':', JSON.stringify(repeats[repeat])
      )
    }
  }
  for (const unique in uniques) {
    if (uniques.hasOwnProperty(unique) && repeats.hasOwnProperty(unique)) {
      log(
        'uniques:', JSON.stringify(unique), ':', JSON.stringify(uniques[unique])
      )
    }
  }
  log('--\n\n ')
}
