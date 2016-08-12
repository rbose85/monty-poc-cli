const curry = (fn) => {
  return (function reCurry(args) {
    return function () {
      const concat = Array.prototype.concat
      const slice = Array.prototype.slice
      const _args = concat.call(args, slice.call(arguments))

      return _args.length >= fn.length ? fn.apply(null, _args) : reCurry(_args)
    }
  })([])
}

const launcher = () => {
  const curried = curry((a, b, c) => a + b + c)

  const i = curried(1, 2)(3)
  console.log(`i: ${i}`) // eslint-disable-line no-console

  const j = curried(2)(4)(8)
  console.log(`j: ${j}`) // eslint-disable-line no-console

  const k = curried(3)(4, 5)
  console.log(`k: ${k}`) // eslint-disable-line no-console
}

module.exports = launcher
