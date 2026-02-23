import dotenv from 'dotenv';
dotenv.config();
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env variable is required');
}

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      return done(null, payload);
    } catch (error) {
      return done(error, false);
    }
  })
);

export default passport;
