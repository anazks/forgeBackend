const Event = require('../models/eventModel');

// @desc    Get all events
// @route   GET /api/events
exports.getEvents = async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        } else if (req.query.entity) {
            query.entity = req.query.entity;
        }

        const events = await Event.find(query).sort({ eventDate: 1 });
        res.status(200).json({ success: true, count: events.length, data: events });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get upcoming events for notifications (1 day before)
// @route   GET /api/events/upcoming
exports.getUpcomingEvents = async (req, res) => {
    try {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const istDate = new Date(utc + (3600000 * 5.5)); // Current time in IST

        const tomorrow = new Date(istDate);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const y = tomorrow.getFullYear();
        const m = tomorrow.getMonth();
        const d = tomorrow.getDate();

        // 00:00:00 IST is 18:30:00 UTC of previous day
        const start = new Date(Date.UTC(y, m, d - 1, 18, 30, 0, 0));
        // 23:59:59.999 IST is 18:29:59.999 UTC of tomorrow
        const end = new Date(Date.UTC(y, m, d, 18, 29, 59, 999));

        let query = {
            eventDate: {
                $gte: start,
                $lte: end
            }
        };

        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        }

        const events = await Event.find(query);
        res.status(200).json({ success: true, count: events.length, data: events });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create event
// @route   POST /api/events
exports.createEvent = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }
        const event = await Event.create(req.body);
        res.status(201).json({ success: true, data: event });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete event
// @route   DELETE /api/events/:id
exports.deleteEvent = async (req, res) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.id);
        if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
