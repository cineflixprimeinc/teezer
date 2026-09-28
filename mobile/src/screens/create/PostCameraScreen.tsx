/**
 * RootNavigator.tsx imports this file, not PostCameraScreenImpl.tsx directly.
 * It used to be an availability gate in front of react-native-vision-camera
 * (a native module that threw at *require* time in Expo Go, so the real
 * implementation had to be require()'d only after confirming it was safe).
 * expo-camera - what PostCameraScreenImpl.tsx uses now - ships inside Expo
 * Go, so there is nothing left to guard; this file is kept only so
 * RootNavigator.tsx's import path doesn't have to change.
 */
export { PostCameraScreenImpl as PostCameraScreen } from "./PostCameraScreenImpl";
