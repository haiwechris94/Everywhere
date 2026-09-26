/**
 * Models Index - Export all Mongoose models
 */
const User = require('./User');
const Village = require('./Village');
const Church = require('./Church');
const Activity = require('./Activity');
const PeopleGroup = require('./PeopleGroup');
const Organization = require('./Organization');
const Notification = require('./Notification');
const ActivityLog = require('./ActivityLog');
const Country = require('./Country');
const PersonOfPeace = require('./PersonOfPeace');
const DiscoveryGroup = require('./DiscoveryGroup');
const DBSSession = require('./DBSSession');
const CoachingSession = require('./CoachingSession');

module.exports = {
  User,
  Village,
  Church,
  Activity,
  PeopleGroup,
  Organization,
  Notification,
  ActivityLog,
  Country,
  PersonOfPeace,
  DiscoveryGroup,
  DBSSession,
  CoachingSession,
};