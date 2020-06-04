import { TrackOpTypes, TriggerOpTypes } from './operations'
import { EMPTY_OBJ, isArray } from '@vue/shared'

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Sets to reduce memory overhead.
//存储{target-> key-> dep}连接的主要WeakMap。 从概念上讲，将依赖关系视为维护一组订阅的Dep类更容易，
//但我们将它们存储为原始set集合以减少内存开销。
type Dep = Set<ReactiveEffect>
type KeyToDepMap = Map<any, Dep>

export interface ReactiveEffect<T = any> {
  (...args: any[]): T
  _isEffect: true
  id: number
  active: boolean
  raw: () => T
  deps: Array<Dep>
  options: ReactiveEffectOptions
}

export interface ReactiveEffectOptions {
  lazy?: boolean
  computed?: boolean
  scheduler?: (job: ReactiveEffect) => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
  onStop?: () => void
}

export type DebuggerEvent = {
  effect: ReactiveEffect
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
} & DebuggerEventExtraInfo

export interface DebuggerEventExtraInfo {
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

const targetMap = new WeakMap<any, KeyToDepMap>()
// effect栈
const effectStack: ReactiveEffect[] = []
//激活的effect
let activeEffect: ReactiveEffect | undefined

export const ITERATE_KEY = Symbol(__DEV__ ? 'iterate' : '')
export const MAP_KEY_ITERATE_KEY = Symbol(__DEV__ ? 'Map key iterate' : '')

// 是否是一个effect
export function isEffect(fn: any): fn is ReactiveEffect {
  return fn && fn._isEffect === true
}

// 接受一个函数和option， 创建一个effect
export function effect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions = EMPTY_OBJ
): ReactiveEffect<T> {
  if (isEffect(fn)) {
    fn = fn.raw
  }
  console.log('!options.lazy,', !options.lazy)
  const effect = createReactiveEffect(fn, options)
  //如果不是lazy的，就执行
  if (!options.lazy) {
    effect()
  }
  return effect
}

export function stop(effect: ReactiveEffect) {
  //如果effect正在执行中，停止
  if (effect.active) {
    cleanup(effect)
    //如果头stop钩子，执行钩子
    if (effect.options.onStop) {
      effect.options.onStop()
    }
    effect.active = false
  }
}
// 标记
let uid = 0

//创建一个响应式effect, effect 可以认为就是个函数
function createReactiveEffect<T = any>(
  fn: (...args: any[]) => T,
  options: ReactiveEffectOptions
): ReactiveEffect<T> {
  const effect = function reactiveEffect(...args: unknown[]): unknown {
    if (!effect.active) {
      return options.scheduler ? undefined : fn(...args)
    }
    //effect栈如果没有该effect
    if (!effectStack.includes(effect)) {
      //
      cleanup(effect)
      try {
        enableTracking()
        effectStack.push(effect)
        activeEffect = effect
        console.log(
          '%c -------------------start-------------------',
          'color: #09e;font-size:18px'
        )
        let resss = fn(...args)
        console.log(
          '%c -------------------end---------------------',
          'color: red;font-size:18px'
        )
        return resss
      } finally {
        console.log('----------finally----------------')
        effectStack.pop()
        resetTracking()
        activeEffect = effectStack[effectStack.length - 1]
        console.log('---------------activeEffect-----', activeEffect)
      }
    }
  } as ReactiveEffect
  effect.id = uid++
  effect._isEffect = true
  effect.active = true
  effect.raw = fn
  effect.deps = []
  effect.options = options
  return effect
}

// 从effect拿出依赖deps，如果存在依赖，删除所有依赖
function cleanup(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}

//是否应该追踪
let shouldTrack = true
//追踪栈
const trackStack: boolean[] = []

// 暂停追踪
export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

//启用追踪栈
export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

//重置追踪栈
export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

//进行收集依赖
//收集template中使用到的响应式数据
//收集到哪？ targetMap中
//
/**
 * 怎么收集？ 例如
 * tempalte中
 * {{state.count}}
 * {{state.name}}
 * state = reactive({count：1, name: 'abc'})
 * makeMap，对象作为键
 * {
 *   {count:1, name:'abc'}: {
 *      count: [],
 *      name: []
 *   },
 * }
 *
 *
 * @param target
 * @param type
 * @param key
 */
export function track(target: object, type: TrackOpTypes, key: unknown) {
  //如果不应该追踪 或者 当前没有进行中的effect，就退出
  console.log('！shouldTrack----------', !shouldTrack)
  console.log('activeEffect-----', activeEffect)
  // console.log(target)
  if (!shouldTrack || activeEffect === undefined) {
    return
  }
  console.log('%c --------targetMap-----', 'color: #090;font-size:18px')
  console.log(targetMap)
  //从targetMap里拿该target对象
  console.log(target)
  let depsMap = targetMap.get(target)
  //如果没有，将改对象添加为targetMap，设置depsMap为new Map()
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()))
  }
  // depsMap是一个Map， 从target里拿到key
  let dep = depsMap.get(key)
  //如果没有
  if (!dep) {
    // 设置
    depsMap.set(key, (dep = new Set()))
  }
  // 所以以上的过程为
  /**
     var data = {count:1};
     var targetMap = new WeakMap();
     var depsMap = new Map();
     targetMap.set(data, depsMap);
     var dep = new Set();
     depsMap.set('count', dep)

     depsMap = {
      count: []
     }
     dep = depsMap.count
   */
  // console.log('dep',dep)
  // console.log('activeEffect',activeEffect)
  //这个是关键
  if (!dep.has(activeEffect)) {
    //将该函数加入到该值的依赖中
    dep.add(activeEffect)
    //同时，该函数的依赖列表里也加入该值
    activeEffect.deps.push(dep)
  }
}

export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>
) {
  //从 依赖列表里拿出该值对应的依赖
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    return
  }

  const effects = new Set<ReactiveEffect>()
  const computedRunners = new Set<ReactiveEffect>()
  // 将effectsToAdd遍历，如果是计算属性，就加入到computedRunners， 如果不是加入到effects
  const add = (effectsToAdd: Set<ReactiveEffect> | undefined) => {
    if (effectsToAdd) {
      effectsToAdd.forEach(effect => {
        if (effect !== activeEffect || !shouldTrack) {
          if (effect.options.computed) {
            computedRunners.add(effect)
          } else {
            effects.add(effect)
          }
        } else {
          // the effect mutated its own dependency during its execution.
          // this can be caused by operations like foo.value++
          // do not trigger or we end in an infinite loop
        }
      })
    }
  }
  TriggerOpTypes.CLEAR
  if (type === TriggerOpTypes.CLEAR) {
    // collection being cleared
    // trigger all effects for target
    depsMap.forEach(add)
  } else if (key === 'length' && isArray(target)) {
    //如果是个数组，并且修改的是length属性
    depsMap.forEach((dep, key) => {
      if (key === 'length' || key >= (newValue as number)) {
        add(dep)
      }
    })
  } else {
    // schedule runs for SET | ADD | DELETE
    //只要key有值
    if (key !== void 0) {
      add(depsMap.get(key))
    }
    // also run for iteration key on ADD | DELETE | Map.SET
    //当前的操作是=>添加或删除
    const isAddOrDelete =
      type === TriggerOpTypes.ADD ||
      (type === TriggerOpTypes.DELETE && !isArray(target))
    if (
      isAddOrDelete ||
      (type === TriggerOpTypes.SET && target instanceof Map)
    ) {
      add(depsMap.get(isArray(target) ? 'length' : ITERATE_KEY))
    }
    if (isAddOrDelete && target instanceof Map) {
      add(depsMap.get(MAP_KEY_ITERATE_KEY))
    }
  }

  const run = (effect: ReactiveEffect) => {
    if (effect.options.scheduler) {
      effect.options.scheduler(effect)
    } else {
      effect()
    }
  }

  // Important: computed effects must be run first so that computed getters
  // can be invalidated before any normal effects that depend on them are run.
  //必须先运行计算属性相关的effect，这样在运行普通effect的时候，computed getters可以无效
  computedRunners.forEach(run)
  effects.forEach(run)
}
