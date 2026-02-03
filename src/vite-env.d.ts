/// <reference types="vite/client" />

// Declare module for inline workers
declare module '*?worker&inline' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
