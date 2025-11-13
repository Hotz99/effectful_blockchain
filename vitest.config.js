"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
exports.default = (0, config_1.defineConfig)({
    test: {
        include: ["./test/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        exclude: [],
        globals: true,
        coverage: {
            provider: "v8"
        }
    }
});
//# sourceMappingURL=vitest.config.js.map