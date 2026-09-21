import Alpine from 'alpinejs';
import {createCopyCode, createDocsNavigation} from './components';

Alpine.data('docsNavigation', createDocsNavigation);
Alpine.data('copyCode', createCopyCode);

Alpine.start();
