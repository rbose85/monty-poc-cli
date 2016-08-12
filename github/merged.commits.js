var co = require('co')
const superagent = require('superagent')
const url = require('url')


/**
 *
 *
 * for a given PR
 - GET by pr_id
 - follow the `events_url`
 - filter the events for `head_ref_deleted`
 - if `head_ref_deleted.length > 0` and `head_ref_deleted % 0 === 0` (even) then branch exists
 - save the `head.sha` and `head.ref` of the PR
 *
 * for a given `head.ref`
 - GET by `head.ref` at `/git/refs/heads/{head.ref}`
 - if `200` (ie not `404`) and not an array, then can be deleted
 - save `head.sha`
 *
 *  for a given `head.ref`
 - DELETE by `head.ref` at `/git/refs/heads/{head.ref}`
 *
 *
 *
 *
 */

const promisedBatches = require('../lib/batcher')

const API_URL = 'https://api.github.com'
const OWNER = 'ag-digital'
const REPO = 'full-monty'
const USER = 'rbose85'
const TOKEN = process.env.GITHUB_TOKEN

const log = console.log     // eslint-disable-line no-console
const err = console.error     // eslint-disable-line no-console

const httpRequest = (path = '', query = {}, method = 'GET') => {
  return new Promise((resolve, reject) => {
    superagent(method, `${API_URL}/repos/${OWNER}/${REPO}/${path}`)
      .query(query)
      .auth(USER, TOKEN)
      .set('Content-Type', 'application/json')
      .accept('application/json')
      .end((err, resp) => {
        if (err) {
          reject(err)
        } else {
          resolve(resp)
        }
      })
  })
}

const getBranch = branchName => {
  // return httpRequest(`git/${branchName}`)
  return httpRequest(`git/refs/heads/${branchName}`)
}

const delBranch = branchName => {
  return httpRequest(`git/refs/heads/${branchName}`, {}, 'DELETE')
}

const getPR = (branchName, state) => {
  return httpRequest(`pulls`, { head: `ag-digital:${branchName}`, state })
}


const getAll = {
  byPath: (path, query = {}) => {
    const headRequest = () => {
      return httpRequest(path, query, 'HEAD')
    }

    const lastPageIndex = ({ links }) => {
      log('\nlinks:', JSON.stringify(links, null, 4), '\n\n')

      if (links && links.last) {
        const query = url.parse(links.last, true).query

        const page = query && parseInt(query.page)
        if (page) {
          return page
        }
      }
    }

    const pageOfPRs = (page = 1) => {
      return httpRequest(path, Object.assign(query, { page }))
    }

    const pagesOfPRs = (pageCount = 1) => {
      log('page count: ', pageCount)

      const promises = new Array(pageCount).fill(0)
      return Promise.all(promises.map((item, idx) => pageOfPRs(idx + 1)))
    }

    const flattenPages = pages => {
      return pages.reduce((bodies, page)=> {
        return [...bodies, ...page.body]
      }, [])
    }

    return headRequest()
      .then(lastPageIndex)
      .then(pagesOfPRs)
      .then(flattenPages)
  }
}

const getAllPRs = (state = 'all') => getAll.byPath('pulls', { state })

const getAllBranches = () => getAll.byPath('branches')

const getAllRefs = () => getAll.byPath('git/refs/heads')


const isMergedPR = pr => {
  return new Promise((resolve, reject) => {
    httpRequest(`pulls/${pr.number}/merge`)
      .then(resp => {
        if (resp.statusCode === 204) {
          resolve(true)
        } else {
          reject(resp)
        }
      })
      .catch(err => {
        if (err.response.statusCode && err.response.statusCode === 404) {
          resolve(false)
        } else {
          reject(err)
        }
      })
  })
}

const isRefPR = branchName => {
  return new Promise((resolve, reject) => {
    getBranch(branchName)
      .then(resp => {
        if (resp.statusType === 2) {
          resolve(!Array.isArray(resp.body))
        } else {
          reject(resp)
        }
      })
      .catch(err => {
        if (err.response.statusCode && err.response.statusCode === 404) {
          resolve(false)
        } else {
          reject(err)
        }
      })
  })
}

const delPRBranch = pr => {
  const ref = pr.head.ref
  log('--deleting-- ref:', ref)
  return delBranch(ref)
}


const group = (prs, batchSize = 10) => {
  return prs.reduce((multi, pr, index, array) => {
    const idx = multi.length - 1
    const arr = multi[idx]
    const len = arr.push(pr)

    if (len === batchSize && index < (array.length - 1)) {
      multi.push([])
    }

    return multi
  }, [[]])
}

const ungroup = (batches) => {
  return [].concat(...batches)
}

const wipOne = () => {
  const since = (prs, date = '2016-05-01T00:00:00') => {
    return prs.filter(pr => (new Date(pr['created_at'])) > (new Date(date)))
  }

  const before = (prs, date = '2016-05-01T00:00:00') => {
    return prs.filter(pr => (new Date(date)) > (new Date(pr['created_at'])))
  }

  const from = '2016-04-01T00:00:00'
  getAllPRs('closed')
    .then(prs => {
      log(`1.   total PRs closed ... ${prs.length}`)
      return before(prs, from)
    })
    .then(prs => {
      log(`2.   total PRs since  ... ${prs.length} \t (${from})`)

      const pullRequests = prs.filter(pr => pr['merged_at'])
      log(`3.   total PRs merged ... ${pullRequests.length}`)

      return pullRequests
    })
    .then(prs => {
      log('fetching ...')
      const batched = group(prs)
      const i = batched.map(batch => {
        return batch.map(pr => {
          return ([isRefPR, [pr]])
        })
      })
      return promisedBatches(i)
        .then(isRefPRs => {
          return isRefPRs.map((batch, y) => {
            return batch.map((isRef, x) => {
              return Object.assign(batched[y][x], { isRef })
            })
          })
        })
        .then(ungroup)
    })
    .then(prs => {
      log('fetching ... completed')
      return prs.filter(pr => pr.isRef)
    })
    .then(prs => {
      log(`4.   PRs ... ${prs.length} (closed & merged)`)
      return prs.map(pr => {
        log('\t pr.head.ref:', pr.head.ref)
        return pr
      })
      // return prs
      // .then(prs => {
      //   log('5.   total PR ... merge ... prs.length:', prs.length)
      //   return prs
      // })
      // .catch((err) => {
      //   log('ERRRRORRRRR', err)
      // })
    })
    .catch(e => {
      err(`it's gone wrong ... e: ${JSON.stringify(e)}`)
    })
}

const wipTwo = () => {
  getAllBranches('closed')
    .then(branches => {
      const grouped = group(branches)

      return promisedBatches(
        grouped.map(batch => batch.map(({ name }) => ([isRefPR, [name]])))
      )
        .then(isRefPRs => {
          return isRefPRs.map((batch, y) => {
            return batch.map((isRef, x) => {
              return Object.assign(grouped[y][x], { isRef })
            })
          })
        })
        .then(ungroup)
    })
    .then(branches => {
      log(`\n\tTOTAL BRANCHES: ${branches.length}\n`)

      const dedupe = (uniques, branch) => {
        if (!uniques.includes(branch)) {
          uniques.push(branch)
        }
        return uniques
      }

      const remains = branches
        .filter(branch => branch.isRef)
        .filter(branch => branch.merged_at)
        .map(branch => branch.head.ref)
        .reduce(dedupe, [])

      const deleted = branches
        .filter(branch => !branch.isRef)
        .filter(branch => branch.merged_at)
        .map(branch => branch.head.ref)
        .reduce(dedupe, [])

      return [remains, deleted]
    })
    .then(([ remains, deleted ]) => {
      log(`\n\tWITH MERGED PR: ${deleted.length}\n`)
      log(`\n\tWITHOUT ANY PR: ${remains.length}\n`) // DELETE THE REMAINS

      log(`\n\nName of branches with merged PR;\n`)
      remains.forEach((branch, index) => {
        const idx = index < 10 ? '0' + index : index
        log(`${index < 100 ? '0' + idx : idx}. branch: ${branch}`)
      })

      log(`\n\nName of branches without merged PR;\n`)
      deleted.forEach((branch, index) => {
        const idx = index < 10 ? '0' + index : index
        log(`${index < 100 ? '0' + idx : idx}. branch: ${branch}`)
      })
    })
    .catch(e => {
      err(`it's gone wrong ... e: ${JSON.stringify(e)}`)
    })
}

const wipThree = () => {
  getAllRefs()
    .then(refs => {
      const exemption = ['master', 'develop']

      return refs.filter(ref => ref.object.type === 'commit')
      // .map(ref => ref.ref)
      // .map(ref => ref.slice('refs/heads/'.length))
        .filter(ref => !exemption.includes(ref.ref))
    })
    .then(refs => {
      const grouped = group(refs)

      return promisedBatches(
        grouped.map(batch => batch.map(({ ref }) => ([isRefPR, [ref]])))
      )
        .then(isRefPRs => {
          return isRefPRs.map((batch, y) => {
            return batch.map((isRef, x) => {
              return Object.assign({ ref: grouped[y][x] }, { isRef })
            })
          })
        })
        .then(ungroup)
    })
    .then(refs => {
      return refs.filter(ref => ref.isRef)
    })
    .then(refs => {
      const grouped = group(refs)

      return promisedBatches(
        grouped.map(batch => batch.map(({ ref }) => ([isRefPR, [ref]])))
      )
        .then(isRefPRs => {
          return isRefPRs.map((batch, y) => {
            return batch.map((isRef, x) => {
              return Object.assign({ ref: grouped[y][x] }, { isRef })
            })
          })
        })
        .then(ungroup)
    })
    .then(refs => {
      log(`\n\tTOTAL REFs: ${refs.length}\n`)
      refs.forEach((ref, index) => {
        const idx = index < 10 ? '0' + index : index
        log(`${index < 100 ? '0' + idx : idx}. ref: ${ref.ref}`)
      })
    })
    .catch(e => {
      err(`it's gone wrong ... e: ${JSON.stringify(e)}`)
    })
}

const wipFour = () => {
  getAllRefs()
    .then(refs => {
      const exemption = ['master', 'develop']

      return refs.filter(ref => ref.object.type === 'commit')
        .map(ref => ref.ref.slice('refs/heads/'.length))
        .filter(ref => !exemption.includes(ref))
    })
    .then(refs => {
      const grouped = group(refs)

      return promisedBatches(
        grouped.map(batch => batch.map((ref) => ([getPR, [ref, 'closed']])))
      )
        .then(batches => {
          return batches.map((batch, y) => {
            return batch.map(({ body: prs }, x) => {
              const pr = Array.isArray(prs) && prs.length === 1 ? prs[0] : null
              return Object.assign({ name: grouped[y][x] }, { pr })
            })
          })
        })
        .then(ungroup)
    })
    .then(branches => {
      log(`\n\tTOTAL:     ${branches.length}\n`)
      return branches.filter(branch => branch.pr)
    })
    .then(branches => {
      log(`\n\tBRANCHES:  ${branches.length}\n`)
      // log(`\n\tLINGERING: ${branches.length}\n`)

      branches.forEach((branch, index) => {
        const idx = index < 10 ? '0' + index : index
        const pr = branch.pr['number']
        log(`${index < 100 ? '0' + idx : idx}. (${pr < 1000 ? ' ' + pr : pr}) ${branch.name}`)
      })
    })
    .catch(e => {
      err(`it's gone wrong ... e: ${e}`)
    })
}

module.exports = wipFour


// .then(branches => {
//   log(`\n\tBRANCHES:  ${branches.length}\n`)
//   const grouped = group(branches)
//
//   return promisedBatches(
//     grouped.map(batch => batch.map((branch) => ([isRefPR, [branch.name]])))
//   )
//     .then(batches => {
//       return batches.map((batch, y) => {
//         return batch.map((isRef, x) => {
//           return Object.assign(grouped[y][x], { isRef })
//         })
//       })
//     })
//     .then(ungroup)
// })
//     .then(branches => {
//       return branches.filter(branch => {
//         if (!branch.isRef) {
//           log(branch.pr['number'], branch.name)
//         }
//         return branch.isRef
//       })
//     })
