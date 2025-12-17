import Fuse from 'fuse.js';

const fuseInstances = {};

self.onmessage = (e) => {
    const { type, tabId, data, query, options } = e.data;

    switch (type) {
        case 'init':
            if (data && data.length > 0) {
                // Always overwrite/create new instance to support re-indexing (progressive loading)
                fuseInstances[tabId] = new Fuse(data, {
                    keys: ['searchData'],
                    includeScore: true,
                    threshold: 0.3,
                    ignoreLocation: true,
                    useExtendedSearch: true,
                    ...options
                });
            }
            break;

        case 'search':
            const fuse = fuseInstances[tabId];
            if (!fuse) {
                self.postMessage({ type: 'results', tabId, query, results: [] });
                return;
            }

            const results = fuse.search(query);
            // We only need to return the IDs to the main thread
            const simplifiedResults = results.map(result => ({
                id: result.item.id,
                score: result.score
            }));

            self.postMessage({ type: 'results', tabId, query, results: simplifiedResults });
            break;

        case 'clear':
            if (fuseInstances[tabId]) {
                delete fuseInstances[tabId];
            }
            break;
    }
};
