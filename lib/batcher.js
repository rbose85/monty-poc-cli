var co = require('co')

const invoke = (fn, args = []) => {
  return fn.apply(null, args)
}

const invoker = batch => {
  const results = []

  for (const item of batch) {
    if (typeof item[0] !== 'function') {
      throw new Error('Malformed batch item. item[0] is not a function.')
    }

    if (!Array.isArray(item[1])) {
      throw new Error('Malformed batch item. item[1] is not an Array.')
    }

    try {
      results.push(invoke(...item))
    } catch (e) {
      throw e
    }
  }

  return results
}

const promisedBatch = batch => {
  return co(function*() {
    return yield Promise.all(
      invoker(batch)
    )
  })
}

const promisedBatches = (batches) => {
  console.log('\t promisedBatches() ... batches.length:', batches.length) // eslint-disable-line no-console
  return co(function*() {
    const results = []

    for (const batch of batches) {
      results.push(yield promisedBatch(batch))
      // results.push(yield promisedBatch(batch).catch(e => e))
      console.log('------ batch No.', results.length) // eslint-disable-line no-console
    }

    return results
  })
}

module.exports = promisedBatches
