import { Prefab, resources } from "cc";

export class ATBUtils {
    static async getPrefabByName(name: string): Promise<Prefab | undefined> {
        return await new Promise<Prefab>((resolve, reject) => {
            resources.load("prefab/" + name, Prefab, (err, prefab) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(prefab);
            });
        }).catch((err) => {
            console.error("加载预制体失败:", err);
            return undefined;
        });
    }
}
