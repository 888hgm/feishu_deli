import { defineConfig } from 'vite';

export default defineConfig({
  // 飞书可将插件托管在子路径下，产物引用应以入口文件所在目录为基准。
  base: './',
});
