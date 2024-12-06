import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// Custom debounce implementation
function useDebounce(callback, delay) {
  const timeoutRef = React.useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedCallback = useCallback(
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );

  return debouncedCallback;
}

const FlightReservation = () => {
  const [startDate, setStartDate] = useState(new Date());
  const [visibleDays, setVisibleDays] = useState([new Date()]);
  const [studentId, setStudentId] = useState('');
  const [timeSlots, setTimeSlots] = useState([]);
  const [hoveredReservation, setHoveredReservation] = useState(null);
  const [tooltipTimer, setTooltipTimer] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [baseUrl, setBaseUrl] = useState('http://localhost:9000');

  // Add URL configuration effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hostParam = params.get('host');
    if (hostParam) {
      setBaseUrl(`https://${hostParam}`);
    }
  }, []);

  // Calculate visible days based on screen width
  const calculateVisibleDays = () => {
    const columnWidth = 100;
    const availableWidth = window.innerWidth - 200;
    return Math.floor(availableWidth / columnWidth);
  };

  // Fetch instructors or aircraft
  const fetchTimeSlotByType = async (startTime, endTime, type) => {
    try {
      const response = await fetch(`${baseUrl}/flight/time-slot-view-by-type-and-time-range`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participantType: type,
          timeBegin: startTime.toISOString(),
          timeEnd: endTime.toISOString(),
        }),
      });

      if (!response.ok) throw new Error(`Failed to fetch ${type} time slots`);
      const data = await response.json();
      return data.timeSlots.filter((slot) => slot.status === 'available');
    } catch (error) {
      console.error(`Error fetching ${type} time slots:`, error);
      return [];
    }
  };

  const fetchTimeSlotsByStudentId = async (studentId, startTime, endTime) => {
    try {
      const response = await fetch(`${baseUrl}/flight/time-slot-view-by-participant-and-time-range`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participantId: studentId,
          participantType: 'student',
          timeBegin: startTime.toISOString(),
          timeEnd: endTime.toISOString(),
        }),
      });
      const data = await response.json();
      return (data.timeSlots || []).filter((slot) => slot.status === 'available' || slot.status === 'scheduled');
    } catch (error) {
      console.error('Error fetching student time slots:', error);
      return [];
    }
  };

  const fetchTimeSlots = async (studentId, startTime, endTime) => {
    if (!studentId) return; // Skip if no studentId

    try {
      // Fetch all data in parallel
      const [studentSlots, instructorSlots, aircraftSlots] = await Promise.all([
        fetchTimeSlotsByStudentId(studentId, startTime, endTime),
        fetchTimeSlotByType(startTime, endTime, 'instructor'),
        fetchTimeSlotByType(startTime, endTime, 'aircraft'),
      ]);

      // Process and combine the data
      const updatedSlots = studentSlots.map((studentSlot) => {
        const slotTime = new Date(studentSlot.startTime);
        const slotEndTime = new Date(slotTime.getTime() + 60 * 60 * 1000); // 1 hour later

        const availableInstructors = instructorSlots.filter((instrSlot) => new Date(instrSlot.startTime).getTime() === slotTime.getTime());

        const availableAircraft = aircraftSlots.filter((acftSlot) => new Date(acftSlot.startTime).getTime() === slotTime.getTime());

        return {
          ...studentSlot,
          isClickable: availableInstructors.length > 0 && availableAircraft.length > 0,
          instructorCount: availableInstructors.length,
          aircraftCount: availableAircraft.length,
        };
      });

      setTimeSlots(updatedSlots);
    } catch (error) {
      console.error('Error fetching time slots:', error);
      setTimeSlots([]);
    }
  };

  const createReservation = async (studentId, startTime) => {
    const reservationId = Array.from({ length: 6 }, () => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 36)]).join('');

    const response = await fetch(`${baseUrl}/flight/booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reservationId,
        studentId,
        reservationTime: startTime.toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create reservation');
    }

    const data = await response.json();
    return data;
  };

  const cancelReservation = async (reservationId) => {
    console.log('Canceling reservation:', reservationId);
    // TODO: Implement actual API call
  };

  const fetchReservationDetails = async (reservationId) => {
    console.log('Fetching reservation details:', reservationId);
    // TODO: Implement actual API call
  };

  // Debounced fetch handler
  const debouncedFetch = useDebounce((value) => {
    if (value) {
      const firstSlot = new Date(visibleDays[0]);
      firstSlot.setHours(0, 0, 0, 0);
      const lastSlot = new Date(visibleDays[visibleDays.length - 1]);
      lastSlot.setHours(23, 59, 59, 999);
      fetchTimeSlots(value, firstSlot, lastSlot);
    }
  }, 300);

  // Handle student ID input
  const handleStudentIdChange = (e) => {
    const value = e.target.value;
    setStudentId(value);
    debouncedFetch(value);
  };

  // Handle time slot click
  const handleTimeSlotClick = async (date, hour, status) => {
    if (isTimeSlotPast(date, hour)) return;

    const startTime = new Date(date);
    startTime.setHours(hour, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(hour, 59, 59, 999);

    if (status === 'available') {
      await createReservation(studentId, startTime);
    } else if (status === 'reserved') {
      await cancelReservation(timeSlot.reservationId);
    }
  };

  // Handle reservation hover
  const handleReservationHover = (event, reservationId) => {
    const { clientX, clientY } = event;
    clearTimeout(tooltipTimer);

    const timer = setTimeout(async () => {
      const details = await fetchReservationDetails(reservationId);
      setHoveredReservation(details);
      setTooltipPosition({ x: clientX, y: clientY });
    }, 300);

    setTooltipTimer(timer);
  };

  const handleReservationLeave = () => {
    clearTimeout(tooltipTimer);
    setHoveredReservation(null);
  };

  // Update visible days when startDate changes
  useEffect(() => {
    const numDays = calculateVisibleDays();
    const days = Array.from({ length: numDays }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      return date;
    });
    setVisibleDays(days);
  }, [startDate]);

  const handleScroll = (days) => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() + days);
    setStartDate(newDate);
  };

  const formatDate = (date) => {
    if (!date) return '';
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return `${days[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
  };

  const isTimeSlotPast = (date, hour) => {
    const now = new Date();
    const slotTime = new Date(date);
    slotTime.setHours(hour);
    return slotTime < now;
  };

  const getTimeSlotStatus = (date, hour) => {
    if (!Array.isArray(timeSlots)) return null;

    const slotTime = new Date(date);
    slotTime.setHours(hour, 0, 0, 0);

    const slot = timeSlots.find((slot) => {
      const startTime = new Date(slot.startTime);
      return startTime.getTime() === slotTime.getTime();
    });

    if (!slot) return null;
    return slot.status;
  };

  const getTimeSlotClass = (date, hour) => {
    if (isTimeSlotPast(date, hour)) {
      return 'bg-gray-100 bg-opacity-10 cursor-not-allowed';
    }

    const slot = timeSlots.find((slot) => {
      const startTime = new Date(slot.startTime);
      return startTime.getTime() === new Date(date).setHours(hour, 0, 0, 0);
    });

    if (!slot) return '';

    if (slot.isClickable) {
      return 'bg-green-700 bg-opacity-50 hover:bg-green-600 cursor-pointer text-yellow-500';
    } else if (slot.status === 'available') {
      return 'bg-yellow-700 bg-opacity-50 text-yellow-500';
    } else if (slot.status === 'scheduled') {
      return 'bg-blue-500 bg-opacity-50 hover:bg-blue-400 text-yellow-500 hover:text-yellow-50 cursor-pointer';
    }

    return '';
  };

  const getTimeSlotCounts = (date, hour) => {
    const slot = timeSlots.find((slot) => {
      const startTime = new Date(slot.startTime);
      return startTime.getTime() === new Date(date).setHours(hour, 0, 0, 0);
    });

    if (!slot) return null;

    if (slot.status === 'scheduled') {
      return (
        <div className='text-[10px] mt-1'>
          {slot.status}
          {slot.reservationId && ` (${slot.reservationId})`}
        </div>
      );
    }

    if (slot.status === 'available') {
      return (
        <div className='text-[10px] mt-1'>
          I-{slot.instructorCount}, A-{slot.aircraftCount}
        </div>
      );
    }

    return null;
  };

  // Add this new effect for periodic refresh
  useEffect(() => {
    // Initial fetch
    if (studentId) {
      const firstSlot = new Date(visibleDays[0]);
      firstSlot.setHours(0, 0, 0, 0);
      const lastSlot = new Date(visibleDays[visibleDays.length - 1]);
      lastSlot.setHours(23, 59, 59, 999);
      fetchTimeSlots(studentId, firstSlot, lastSlot);
    }

    // Set up interval
    const intervalId = setInterval(() => {
      if (studentId && visibleDays.length > 0) {
        const firstSlot = new Date(visibleDays[0]);
        firstSlot.setHours(0, 0, 0, 0);
        const lastSlot = new Date(visibleDays[visibleDays.length - 1]);
        lastSlot.setHours(23, 59, 59, 999);
        fetchTimeSlots(studentId, firstSlot, lastSlot);
      }
    }, 500); // Refresh every 0.5 second

    // Cleanup
    return () => clearInterval(intervalId);
  }, [studentId, visibleDays]); // Dependencies

  return (
    <div className='flex flex-col h-screen bg-gray-900 text-gray-100'>
      {/* Header Controls */}
      <div className='p-4 bg-gray-800 border-b border-gray-700 flex justify-between'>
        <div className='flex items-center space-x-4'>
          <input type='text' placeholder='Student ID' className='bg-gray-700 text-gray-100 p-2 rounded' value={studentId} onChange={handleStudentIdChange} />
          <h1 className='text-xl font-semibold text-yellow-500'>Book a flight lesson</h1>
        </div>
        <Link to='/' className='p-2 bg-gray-700 rounded hover:bg-gray-600 text-yellow-500 hover:text-white'>
          Calendar
        </Link>
      </div>

      {/* Calendar Grid */}
      <div className='flex flex-1 relative'>
        {/* Left Scroll Buttons */}
        <div className='absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-center space-y-4 bg-gray-800 bg-opacity-50 p-2'>
          <div className='text-sm text-center mb-4'>{visibleDays.length > 0 && formatDate(visibleDays[0])}</div>
          <button onClick={() => handleScroll(-1)} className='p-2 bg-gray-700 rounded hover:bg-gray-600'>
            <ChevronLeft className='w-4 h-4' />
            1d
          </button>
          <button onClick={() => handleScroll(-7)} className='p-2 bg-gray-700 rounded hover:bg-gray-600'>
            <ChevronLeft className='w-4 h-4' />
            7d
          </button>
          <button onClick={() => handleScroll(-30)} className='p-2 bg-gray-700 rounded hover:bg-gray-600'>
            <ChevronLeft className='w-4 h-4' />
            30d
          </button>
        </div>

        {/* Time Slots Grid */}
        <div className='flex-1 overflow-x-hidden mx-16'>
          <div className='flex h-full'>
            {visibleDays.map((date) => (
              <div key={date.toISOString()} className='flex-1 min-w-[100px] border-l border-gray-700'>
                <div className='text-sm text-center py-2'>{formatDate(date)}</div>
                <div className='flex flex-col h-full'>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const status = getTimeSlotStatus(date, hour);
                    return (
                      <div
                        key={hour}
                        className={`flex-1 border-t border-gray-700 p-1 text-xs text-center ${getTimeSlotClass(date, hour)}`}
                        onClick={() => handleTimeSlotClick(date, hour, status)}
                        onMouseEnter={(e) => status === 'reserved' && handleReservationHover(e, 'reservation-id')}
                        onMouseLeave={handleReservationLeave}
                      >
                        <div>{String(hour).padStart(2, '0')}:00</div>
                        {getTimeSlotCounts(date, hour)}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Scroll Buttons */}
        <div className='absolute right-0 top-0 bottom-0 w-16 flex flex-col justify-center space-y-4 bg-gray-800 bg-opacity-50 p-2'>
          <div className='text-sm text-center mb-4'>{visibleDays.length > 0 && formatDate(visibleDays[visibleDays.length - 1])}</div>
          <button onClick={() => handleScroll(1)} className='p-2 bg-gray-700 rounded hover:bg-gray-600'>
            1d
            <ChevronRight className='w-4 h-4' />
          </button>
          <button onClick={() => handleScroll(7)} className='p-2 bg-gray-700 rounded hover:bg-gray-600'>
            7d
            <ChevronRight className='w-4 h-4' />
          </button>
          <button onClick={() => handleScroll(30)} className='p-2 bg-gray-700 rounded hover:bg-gray-600'>
            30d
            <ChevronRight className='w-4 h-4' />
          </button>
        </div>

        {/* Reservation Tooltip */}
        {hoveredReservation && (
          <div
            className='absolute bg-gray-800 p-3 rounded shadow-lg z-50 text-sm'
            style={{
              left: tooltipPosition.x + 10,
              top: tooltipPosition.y + 10,
            }}
          >
            <div>Reservation ID: {hoveredReservation.id}</div>
            <div>Time: {hoveredReservation.time}</div>
            <div>Student: {hoveredReservation.studentId}</div>
            <div>Instructor: {hoveredReservation.instructorId}</div>
            <div>Aircraft: {hoveredReservation.aircraftId}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlightReservation;
