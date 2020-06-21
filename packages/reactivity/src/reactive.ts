/**
 * 根据index目录
 * // 导出响应式相关的
export {
  reactive,
  readonly,
  isReactive,
  isReadonly,
  isProxy,
  shallowReactive,
  shallowReadonly,
  markRaw,
  toRaw,
  ReactiveFlags
} from './reactive'
 */

import { isObject, toRawType, def, hasOwn, makeMap } from '@vue/shared'
import {
  mutableHandlers,
  readonlyHandlers,
  shallowReactiveHandlers,
  shallowReadonlyHandlers
} from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers,
  shallowCollectionHandlers
} from './collectionHandlers'
import { UnwrapRef, Ref } from './ref'

export const enum ReactiveFlags {
  skip = '__v_skip',
  isReactive = '__v_isReactive',
  isReadonly = '__v_isReadonly',
  raw = '__v_raw',
  reactive = '__v_reactive',
  readonly = '__v_readonly'
}

interface Target {
  __v_skip?: boolean
  __v_isReactive?: boolean
  __v_isReadonly?: boolean
  __v_raw?: any
  __v_reactive?: any
  __v_readonly?: any
}

const collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])
const isObservableType = /*#__PURE__*/ makeMap(
  'Object,Array,Map,Set,WeakMap,WeakSet'
)

const canObserve = (value: Target): boolean => {
  //__v_skip是false，且该值的类型是 数组，对象，map，set 且该值没有被冻结
  return (
    !value.__v_skip &&
    isObservableType(toRawType(value)) &&
    !Object.isFrozen(value)
  )
}

// only unwrap nested ref
type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>

export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  // 如果只读，直接返回
  if (target && (target as Target).__v_isReadonly) {
    return target
  }
  //创建响应式对象
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers
  )
}

// Return a reactive-copy of the original object, where only the root level
// properties are reactive, and does NOT unwrap refs nor recursively convert
// returned properties.
//返回原始对象的反应副本，其中只有根级别属性是响应的，不会解开引用也不会递归转换
//返回的属性。
export function shallowReactive<T extends object>(target: T): T {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers
  )
}

export function readonly<T extends object>(
  target: T
): Readonly<UnwrapNestedRefs<T>> {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers
  )
}

//返回原始对象的反应副本，其中只有根级别属性是只读的，不会解开引用也不会递归转换返回的属性
//这用于为有状态组件创建props代理对象。
export function shallowReadonly<T extends object>(
  target: T
): Readonly<{ [K in keyof T]: UnwrapNestedRefs<T[K]> }> {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    readonlyCollectionHandlers
  )
}

function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  // console.trace()
  // console.log('--target--', target)
  // console.log('--isReadonly--', isReadonly)
  // console.log(isReadonly)
  // 如果不是对象，直接返回该值
  if (!isObject(target)) {
    return target
  }
  // target is already a Proxy, return it.
  // exception: calling readonly() on a reactive object
  //有__v_raw，并且不是只读或者不是响应的
  if (target.__v_raw && !(isReadonly && target.__v_isReactive)) {
    return target
  }

  // 上面这些没啥用，边界处理

  // target already has corresponding Proxy
  // hasOwn: hasOwnProperty.call(val, key)
  // console.log(hasOwn(target, isReadonly ? ReactiveFlags.readonly : ReactiveFlags.reactive))
  // 如果isReadonly是只读的，判断target是否有__v_isReadonly属性，否则判断是否有__v_isReactive属性
  // 说白了就是判断 是否存在target.__v_isReadonly或target.__v_isReactive
  hasOwn(target, isReadonly ? ReactiveFlags.readonly : ReactiveFlags.reactive)
  if (
    hasOwn(target, isReadonly ? ReactiveFlags.readonly : ReactiveFlags.reactive)
  ) {
    return isReadonly ? target.__v_readonly : target.__v_reactive
  }
  // only a whitelist of value types can be observed.
  //判断该值是否一个可被观察的值
  if (!canObserve(target)) {
    return target
  }
  // 创建该值的代理, 如果该值是map或set结构，代理函数用collectionHandlers，否则数组，对象用baseHandlers
  const observed = new Proxy(
    target,
    collectionTypes.has(target.constructor) ? collectionHandlers : baseHandlers
  )

  // def为
  // return Object.defineProperty(obj, key, {
  //   configurable: true,
  //   value
  // })
  //修改target的__v_isReadonly或__v_isReactive，这是给第154行用的，性能优化，避免重发创建
  def(
    target,
    isReadonly ? ReactiveFlags.readonly : ReactiveFlags.reactive,
    observed
  )

  return observed
}

export function isReactive(value: unknown): boolean {
  if (isReadonly(value)) {
    return isReactive((value as Target).__v_raw)
  }
  return !!(value && (value as Target).__v_isReactive)
}

//该值的__v_isReadonly，用来判断是否只读属性
export function isReadonly(value: unknown): boolean {
  return !!(value && (value as Target).__v_isReadonly)
}

export function isProxy(value: unknown): boolean {
  return isReactive(value) || isReadonly(value)
}

export function toRaw<T>(observed: T): T {
  return (observed && toRaw((observed as Target).__v_raw)) || observed
}

export function markRaw<T extends object>(value: T): T {
  def(value, ReactiveFlags.skip, true)
  return value
}
