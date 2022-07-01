export class FastLookUpCache {
    private fastLookupRecordCache: Map<string, object> = new Map<string, object>();


    private cachingHitCount: Map<string, number> = new Map<string, number>();

    hasItem = (key: string) => {
        return this.fastLookupRecordCache.has(key);
    };

    addItem = (key: string, value: object) => {
        this.fastLookupRecordCache.set(key, value);
    };

    getItem = (key: string) => {
        if (this.fastLookupRecordCache.has(key)) {
            const resultItem = this.fastLookupRecordCache.get(key) || null;

            if (resultItem) {
                const count = this.cachingHitCount.get(key) || 0;
                this.cachingHitCount.set(key, count + 1);
            }

            return resultItem;
        }

        return null;
    };
}
