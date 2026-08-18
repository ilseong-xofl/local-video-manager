declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const LVM_GITHUB_REPOSITORY: string;
declare const LVM_SERVICE_URL: string;

declare module 'electron-squirrel-startup' {
  const squirrelStartup: boolean;
  export default squirrelStartup;
}
