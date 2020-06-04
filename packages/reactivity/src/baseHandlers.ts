import { reactive, readonly, toRaw } from './reactive'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import { track, trigger, ITERATE_KEY } from './effect'
import { isObject, hasOwn, hasChanged, isArray } from '@vue/shared'
import { isRef } from './ref'

const get = /*#__PURE__*/ createGetter()
const shallowGet = /*#__PURE__*/ createGetter(false, true)
const readonlyGet = /*#__PURE__*/ createGetter(true)
const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true)

const arrayInstrumentations: Record<string, Function> = {}
;['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
  arrayInstrumentations[key] = function(...args: any[]): any {
    const arr = toRaw(this) as any
    for (let i = 0, l = (this as any).length; i < l; i++) {
      track(arr, TrackOpTypes.GET, i + '')
    }
    // we run the method using the original args first (which may be reactive)
    const res = arr[key](...args)
    if (res === -1 || res === false) {
      // if that didn't work, run it again using raw values.
      return arr[key](...args.map(toRaw))
    } else {
      return res
    }
  }
})

//创建getter, //只要不是只读就加入到track，收集依赖，进行监听响应
function createGetter(isReadonly = false, shallow = false) {
  return function get(target: object, key: string | symbol, receiver: object) {
    // 获取值的__v_isReactive， __v_isReadonly， __v_raw时的返回值
    if (key === '__v_isReactive') {
      return !isReadonly
    } else if (key === '__v_isReadonly') {
      return isReadonly
    } else if (key === '__v_raw') {
      return target
    }
    console.log(
      '%c -----------createGetter---------',
      'color: #09e;font-size:16px'
    )
    // console.log(target)
    // console.log('key----',key)
    //响应值是否为数组
    const targetIsArray = isArray(target)
    //如果是数组，返回 target[key] key是下标
    if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
      return Reflect.get(arrayInstrumentations, key, receiver)
    }
    /***************target是对象***************/
    //拿到值
    const res = Reflect.get(target, key, receiver)

    //当 shallowGet  shallowReadonlyGet 时，需要走下面
    if (shallow) {
      //如果是shallowGet，则track
      !isReadonly && track(target, TrackOpTypes.GET, key)
      return res
    }
    // 计算属性的会设置__v_isRef为true，所以计算属性会走这里
    if (isRef(res)) {
      if (targetIsArray) {
        !isReadonly && track(target, TrackOpTypes.GET, key)
        return res
      } else {
        return res.value
      }
    }

    !isReadonly && track(target, TrackOpTypes.GET, key)

    return isObject(res)
      ? isReadonly
        ? // need to lazy access readonly and reactive here to avoid
          // circular dependency
          // 需要在这里延迟 只读访问和响应访问 以避免循环依赖
          //也就是说
          // let animal = { dog: {prop: {name: 1}}}
          // 当template中是这样的引用时，animal.dog.prop.name其实是这样的
          // return reactive({dog: {prop: {name: 1}}})
          // return reactive({prop: {name:1}})
          // return reactive({name: 1})
          // return 1
          readonly(res)
        : reactive(res)
      : res
  }
}

const set = /*#__PURE__*/ createSetter()
const shallowSet = /*#__PURE__*/ createSetter(true)

function createSetter(shallow = false) {
  return function set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {
    const oldValue = (target as any)[key]
    if (!shallow) {
      value = toRaw(value)
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        oldValue.value = value
        return true
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
    }

    const hadKey = hasOwn(target, key)
    const result = Reflect.set(target, key, value, receiver)
    // don't trigger if target is something up in the prototype chain of original
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  track(target, TrackOpTypes.HAS, key)
  return result
}

function ownKeys(target: object): (string | number | symbol)[] {
  track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
  return Reflect.ownKeys(target)
}

//响应，
export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
  deleteProperty,
  has,
  ownKeys
}
//只读
export const readonlyHandlers: ProxyHandler<object> = {
  get: readonlyGet,
  has,
  ownKeys,
  set(target, key) {
    return true
  },
  deleteProperty(target, key) {
    return true
  }
}

// 浅响应，重写了get和set方法
export const shallowReactiveHandlers: ProxyHandler<object> = {
  ...mutableHandlers,
  get: shallowGet,
  set: shallowSet
}

// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.

// prop处理程序是特殊的，它不应解开顶级ref（以使ref被显式传递），而应保留普通readonly对象的反应性。
// 浅只读，重写了get方法，说明readonlyHandlers的get应该是解开了顶级ref
export const shallowReadonlyHandlers: ProxyHandler<object> = {
  ...readonlyHandlers,
  get: shallowReadonlyGet
}
