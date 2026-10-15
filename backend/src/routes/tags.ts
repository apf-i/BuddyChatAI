import express from 'express';
import { TAG_LIBRARY, TAG_CATEGORIES, getAllTags, searchTags, getTagsByCategory } from '../utils/tags';

const router = express.Router();

// Get all tags grouped by category
router.get('/', async (req, res) => {
  try {
    res.json({
      categories: TAG_LIBRARY,
      allTags: getAllTags(),
    });
  } catch (error: any) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Search tags
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = searchTags(q);
    res.json({ tags: results });
  } catch (error: any) {
    console.error('Error searching tags:', error);
    res.status(500).json({ error: 'Failed to search tags' });
  }
});

// Get tags by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const tags = getTagsByCategory(category);
    res.json({ tags });
  } catch (error: any) {
    console.error('Error fetching tags by category:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

export default router;
