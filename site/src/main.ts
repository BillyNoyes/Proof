import Alpine from 'alpinejs';
import {createCopyCode, createDocsNavigation} from './components';
import {createPreviewDemo} from './preview-demo';

Alpine.data('docsNavigation', createDocsNavigation);
Alpine.data('copyCode', createCopyCode);
Alpine.data('previewDemo', createPreviewDemo);

Alpine.start();
