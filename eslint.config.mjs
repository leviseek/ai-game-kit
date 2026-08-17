// ESLint flat config：基于 typescript-eslint recommended（非 type-aware），
// 覆盖 assets（框架/游戏/样例）、tools（fgui/creator）、tests、scripts。
// 非 type-aware 避免依赖 Cocos 的 temp/tsconfig.cocos.json 解析，规则以语法与风格检查为主。
//
// 项目约定适配：
// - _ 前缀的入参/变量视为故意未使用（测试 mock 参数、回调占位）
// - *.typecheck.ts 是类型断言文件，声明未使用属预期（仅编译期校验契约）
// - libs/fairygui/ 为第三方库源码，不参与 lint
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "node_modules/**",
            "temp/**",
            "library/**",
            "build/**",
            "local/**",
            "profiles/**",
            "settings/**",
            "history/**",
            ".git/**",
            ".opencode/**",
            ".codex/**",
            ".codegraph/**",
            ".qoder/**",
            ".superpowers/**",
            ".cursor/**",
            "ui/**",
            "assets/framework/libs/fairygui/**",
            "third-party/**",
            "**/*.d.ts",
        ],
    },
    ...tseslint.configs.recommended,
    // 自定义规则需放在 recommended 之后，否则会被 recommended 的默认值覆盖。
    // 未使用变量降级为 warn（不再阻断）：Cocos 组件骨架常含未使用的 Node/property/deltaTime 占位。
    {
        files: ["**/*.ts", "**/*.mjs"],
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
        },
    },
    {
        files: ["**/*.typecheck.ts"],
        rules: {
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-empty-object-type": "off",
        },
    },
);
