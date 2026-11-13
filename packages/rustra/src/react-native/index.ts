/** @unikit-bridge/react-native — JSI, async, event, and channel adapter surfaces. */
export type {
  EngineClient,
  EngineSupports,
  BootstrapState,
  InvokeOptions,
  UnikitError,
  FrameCodec,
  FrameNative,
  FrameSchemaNative,
} from '../types/index.js';
export {
  CancelledError,
  UnikitCommandError,
  TimeoutError,
  configure,
  disposedBootstrapError,
  invoke,
  createFrameEngine,
  parseUnikitErrorString,
} from '../types/index.js';
export {
  createReactNativeEngine,
  createUnikitBootstrap,
  getUnikitNative,
  createFastEngine,
  REACT_NATIVE_JSON_ENGINE_SUPPORTS,
  REACT_NATIVE_FRAME_ENGINE_SUPPORTS,
} from './react-native-core.js';
export type {
  ReactNativeEngine,
  UnikitJSINative,
  FastEngineOptions,
  UnikitBootstrapOptions,
  UnikitBootstrap,
} from './react-native-core.js';
export { createAsyncEngine } from './react-native-async.js';
export type { UnikitJSIAsyncNative } from './react-native-async.js';
export {
  createBytesChannel,
  createChannel,
  invokeTypedSync,
  subscribeEvent,
} from './react-native-events.js';
export type { UnikitEventNative, UnikitChannelNative } from './react-native-events.js';
