const express = require('express');
const {
    getEvents,
    getUpcomingEvents,
    createEvent,
    deleteEvent
} = require('../controllers/eventController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getEvents)
    .post(protect, createEvent);

router.get('/upcoming', protect, getUpcomingEvents);

router.route('/:id')
    .delete(protect, deleteEvent);

module.exports = router;
