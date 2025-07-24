/**
 * @module gridVirtualList
 * @description Implements a virtualized list component for efficiently rendering grid-based layouts.
 * It virtualizes rows of items rather than individual items.
 */
export class GridVirtualList {
    /**
     * @param {HTMLElement} container - The scrollable container element.
     * @param {Array} allItems - The flat array of all items to display.
     * @param {object} options - Configuration options.
     * @param {function} options.renderRow - Function to render a single row. Signature: (rowItems) => HTMLElement.
     * @param {function} options.getRowHeight - Function that returns the height of a row in pixels.
     * @param {function} options.getColumnCount - Function that returns the current number of grid columns.
     */
    constructor(container, allItems, options) {
        if (!container || !Array.isArray(allItems) || !options) {
            throw new Error('GridVirtualList requires a container, an items array, and an options object.');
        }

        this.container = container;
        this.allItems = allItems;
        this.renderRow = options.renderRow;
        this.getRowHeight = options.getRowHeight;
        this.getColumnCount = options.getColumnCount;

        this.rows = [];
        this.rowPositions = [];
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.scrollTop = 0;
        this.viewport = null;
        this.resizeObserver = null;
        this._boundOnScroll = this._onScroll.bind(this);

        this.init();
    }

    _groupItemsIntoRows() {
        const columnCount = this.getColumnCount();
        if (columnCount === 0) {
            this.rows = [];
            return;
        }
        const rows = [];
        for (let i = 0; i < this.allItems.length; i += columnCount) {
            rows.push(this.allItems.slice(i, i + columnCount));
        }
        this.rows = rows;
    }

    _calculateRowPositions() {
        let currentTop = 0;
        const rowHeight = this.getRowHeight();
        this.rowPositions = this.rows.map(() => {
            const position = { top: currentTop, height: rowHeight };
            currentTop += rowHeight;
            return position;
        });
    }

    init() {
        this.container.style.overflowY = 'auto';
        this.container.style.position = 'relative';

        this.container.innerHTML = `<div class="list-viewport" style="position: relative; overflow: hidden;"></div>`;
        this.viewport = this.container.firstElementChild;

        this.recalculate(); // Initial calculation

        this.container.addEventListener('scroll', this._boundOnScroll);
        
        // Watch for resizes to handle responsive column changes
        this.resizeObserver = new ResizeObserver(() => this.recalculate());
        this.resizeObserver.observe(this.container);
    }
    
    recalculate() {
        this._groupItemsIntoRows();
        this._calculateRowPositions();
        this._updateViewportHeight();
        this._updateVisibleItems();
    }

    _onScroll() {
        this.scrollTop = this.container.scrollTop;
        this._updateVisibleItems();
    }

    _updateVisibleItems() {
        const containerHeight = this.container.clientHeight;
        if (containerHeight <= 0 || this.rowPositions.length === 0) {
            if (this.viewport) this.viewport.innerHTML = '';
            return;
        }

        const rowHeight = this.getRowHeight();
        const startNode = Math.floor(this.scrollTop / rowHeight);
        const visibleNodeCount = Math.ceil(containerHeight / rowHeight);

        const buffer = 3; // Render a few extra rows for smooth scrolling
        this.visibleStart = Math.max(0, startNode - buffer);
        this.visibleEnd = Math.min(this.rows.length, startNode + visibleNodeCount + buffer);

        this._render();
    }

    _render() {
        this.viewport.innerHTML = ''; // Clear previous items

        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            const rowWrapper = document.createElement('div');
            rowWrapper.style.position = 'absolute';
            rowWrapper.style.top = `${this.rowPositions[i].top}px`;
            rowWrapper.style.height = `${this.rowPositions[i].height}px`;
            rowWrapper.style.width = '100%';

            try {
                const rowContent = this.renderRow(this.rows[i]);
                rowWrapper.appendChild(rowContent);
            } catch (error) {
                console.error(`Error rendering row at index ${i}:`, error);
            }
            this.viewport.appendChild(rowWrapper);
        }
    }
    
    updateAllItems(newItems) {
        this.allItems = newItems;
        this.recalculate();
    }

    destroy() {
        this.container.removeEventListener('scroll', this._boundOnScroll);
        this.resizeObserver?.disconnect();
        this.container.innerHTML = '';
        this.viewport = null;
        this.rows = [];
    }

    _updateViewportHeight() {
        const totalHeight = this.rowPositions.length > 0 ?
            this.rowPositions[this.rowPositions.length - 1].top + this.rowPositions[this.rowPositions.length - 1].height : 0;
        this.viewport.style.height = `${totalHeight}px`;
    }
}