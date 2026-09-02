import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import typia from '@typia/unplugin/vite';

const autoValidateBody = (): Plugin => ({
    name: 'app:auto-validate-body',
    enforce: 'pre',
    transform(code, id){
        if(!/src\/modules\/[^/?]+\/controllers\/[^/?]+\.ts(\?.*)?$/.test(id)) return null;
        if(!code.includes('@Body()')) return null;

        let out = code.replace(
            /@Body\(\)(\s+)(\w+):(\s*)(\w+)/g,
            '@Body(typia.misc.createValidatePrune<$4>())$1$2:$3$4'
        );
        if(!/from 'typia'/.test(out)) out += "\nimport typia from 'typia';\n";
        return { code: out, map: null };
    }
});

export default defineConfig({
    plugins: [
        autoValidateBody(),
        typia({ tsconfig: './tsconfig.json', cache: true })
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    }
});
