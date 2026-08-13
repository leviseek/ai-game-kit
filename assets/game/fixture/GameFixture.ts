/**
 * 品类组合夹具公共契约的薄重导出：实现已迁至 framework=main（共享 bundle），
 * 本文件保持既有导入路径兼容——game bundle 内部与测试仍可从 game/fixture 导入。
 * 跨 bundle 的 samples 侧消费方应改经 framework 根入口取该运行时 helper，
 * 避免 createGameFixture 实现体重复打进 game 与 samples 两个 chunk。
 */
export { createGameFixture, type GameFixture, type GameFixtureOptions } from "../../framework";
