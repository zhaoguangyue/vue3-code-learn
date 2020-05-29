import { isArray } from '@vue/shared'

/**
 * 维护了两个队列
 * 一个主工作队列，一个回调队列
 * 核心方法flushJobs，一个循环系统，会轮询将工作队列和回调队列中所有的函数全部执行，具体过程如下
 * 该方法会先检查所有的工作队列，并以此执行工作队列中所有的函数
 * 然后检查回调队列，同样执行回调队列中所有的方法
 * 回调队列执行完后，检查在回调队列执行过程期间，是否有新的任务添加到了工作队列或回调队列中
 * 如果有，再次执行flushJobs
 *
 * 可以使用 queueJob 和 queuePostFlushCb 来往对应的队列中添加任务，每次添加完后，检查循环系统是否处于工作中或者待工作状态，
 * 如果否，则启动循环系统
 */
export interface Job {
  (): void
  id?: number
}
//任务队列
const queue: (Job | null)[] = []
//发送刷新回调
const postFlushCbs: Function[] = []
const p = Promise.resolve()

//正在刷新中
let isFlushing = false
//存在待刷新中
let isFlushPending = false

type CountMap = Map<Job | Function, number>

//使用微任务的方式执行函数
export function nextTick(fn?: () => void): Promise<void> {
  return fn ? p.then(fn) : p
}
//往工作队列加添加工作
export function queueJob(job: Job) {
  if (!queue.includes(job)) {
    queue.push(job)
    queueFlush()
  }
}

//从工作队列中删除工作
export function invalidateJob(job: Job) {
  const i = queue.indexOf(job)
  if (i > -1) {
    queue[i] = null
  }
}

//往回调队列中添加回调
export function queuePostFlushCb(cb: Function | Function[]) {
  if (!isArray(cb)) {
    postFlushCbs.push(cb)
  } else {
    postFlushCbs.push(...cb)
  }
  queueFlush()
}

//没有正在执行的函数，则启动flushJobs
function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    //标记为待启动
    isFlushPending = true
    //作为promise微任务执行
    nextTick(flushJobs)
  }
}

export function flushPostFlushCbs(seen?: CountMap) {
  //检查，只要postFlushCbs中有回调，就执行
  if (postFlushCbs.length) {
    //去重
    const cbs = [...new Set(postFlushCbs)]
    //清空
    postFlushCbs.length = 0
    //执行所有的订阅函数
    for (let i = 0; i < cbs.length; i++) {
      cbs[i]()
    }
  }
}

const getId = (job: Job) => (job.id == null ? Infinity : job.id)

//刷新
function flushJobs(seen?: CountMap) {
  //正在启动中，关闭待启动
  isFlushPending = false
  //标记为启动中
  isFlushing = true
  let job
  // Sort queue before flush. 在刷新之前对队列进行排序。
  // This ensures that: 这样可以确保：
  // 1.组件从父级更新为子级。 （因为父级总是在子级之前创建的，因此其渲染效果的优先级编号会较小）
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child so its render effect will have smaller priority number)
  //
  // 2.如果在父组件更新期间卸载了组件，则可以跳过其更新。 在开始刷新之前，
  // 作业永远不能为空，因为它们仅在执行另一个已刷新的作业期间无效。
  // 2. If a component is unmounted during a parent component's update,
  //    its update can be skipped.
  // Jobs can never be null before flush starts, since they are only invalidated
  // during execution of another flushed job.

  //队列根据id进行排序
  queue.sort((a, b) => getId(a!) - getId(b!))

  //从第一个开始，逐个执行工作队列中的函数
  while ((job = queue.shift()) !== undefined) {
    if (job === null) {
      continue
    }

    job()
  }
  //将所有的回调全部执行
  flushPostFlushCbs(seen)
  //标记为关闭
  isFlushing = false
  //将队列中和订阅回调全部进行刷新
  if (queue.length || postFlushCbs.length) {
    flushJobs(seen)
  }
}
