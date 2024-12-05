import React from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import FlightReservation from './components/FlightReservation';
import TimeSlotScheduler from './components/TimeSlotScheduler';

const App = () => {
  return (
    <Router>
      <div>
        <Routes>
          <Route path='/' element={<TimeSlotScheduler />} />
          <Route path='/reservations' element={<FlightReservation />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
