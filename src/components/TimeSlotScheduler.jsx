import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const TimeSlotScheduler = () => {
  const [startDate, setStartDate] = useState(new Date());
  const [visibleDays, setVisibleDays] = useState([new Date()]); // Initialize with current date
  const [timeSlots, setTimeSlots] = useState({ timeSlots: [] });
  const [participantType, setParticipantType] = useState('student');
  const [participantId, setParticipantId] = useState('');
  const [hoveredReservation, setHoveredReservation] = useState(null);
  const [baseUrl, setBaseUrl] = useState('http://localhost:9000');
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Add URL configuration effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hostParam = params.get('host');
    if (hostParam) {
      setBaseUrl(`https://${hostParam}`);
    }
  }, []);

  // Fetch time slots from the backend
  useEffect(() => {
    let intervalId;

    const fetchTimeSlots = async () => {
      if (!participantId) return; // Skip if no participantId

      try {
        const startHour = 0;
        const endHour = 24;

        const endDate = new Date(visibleDays[visibleDays.length - 1]);
        endDate.setHours(endHour, 0, 0, 0);

        const response = await fetch(`${baseUrl}/flight/time-slot-view-by-participant-and-time-range`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            participantType: participantType,
            participantId: participantId,
            timeBegin: visibleDays[0].toISOString(),
            timeEnd: endDate.toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch time slots');
        }

        const data = await response.json();
        setTimeSlots(data);
      } catch (error) {
        console.error('Error fetching time slots:', error);
      }
    };

    // Only set up interval if we have a participantId
    if (participantId) {
      fetchTimeSlots(); // Initial fetch
      intervalId = setInterval(fetchTimeSlots, 500); // 0.5 second
    }

    // Cleanup function to clear interval when component unmounts or dependencies change
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [participantType, participantId, visibleDays, baseUrl]);

  // Calculate how many days can fit based on screen width
  const calculateVisibleDays = () => {
    const columnWidth = 100; // pixels
    const availableWidth = window.innerWidth - 200; // subtract space for scroll buttons
    return Math.floor(availableWidth / columnWidth);
  };

  // Generate array of dates for visible range
  useEffect(() => {
    const numDays = calculateVisibleDays();
    const days = [];
    for (let i = 0; i < numDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    setVisibleDays(days);
  }, [startDate]);

  const handleScroll = (days) => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() + days);
    setStartDate(newDate);
  };

  const formatDate = (date) => {
    if (!date) return '';
    const weekday = date.toLocaleString('en-US', { weekday: 'short' })[0];
    return `${weekday} ${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatScrollDate = (date) => {
    if (!date) return '';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className='flex flex-col'>
        <span>{days[date.getDay()]}</span>
        <span>
          {date.getMonth() + 1}/{date.getDate()}
        </span>
      </div>
    );
  };

  const isTimeSlotPast = (date, hour) => {
    const now = new Date();
    const slotTime = new Date(date);
    slotTime.setHours(hour, 0, 0, 0);
    return slotTime < now;
  };

  // Helper function to find time slot for a specific date and hour
  const findTimeSlot = (date, hour) => {
    const startOfHour = new Date(date);
    startOfHour.setHours(hour, 0, 0, 0);

    return timeSlots.timeSlots?.find((slot) => {
      const slotTime = new Date(slot.startTime);
      return slotTime.getTime() === startOfHour.getTime();
    });
  };

  // Helper function to get className based on time slot status
  const getTimeSlotClassName = (timeSlot, isPast) => {
    if (isPast) return 'bg-gray-100 bg-opacity-10 cursor-not-allowed';
    if (!timeSlot) return 'hover:bg-gray-700 cursor-pointer';

    const statusClasses = {
      available: 'bg-green-700 bg-opacity-50 hover:bg-green-600 text-yellow-500 cursor-pointer',
      scheduled: 'bg-blue-500 bg-opacity-50 hover:bg-blue-400 text-yellow-500 hover:text-yellow-100 cursor-pointer',
      unavailable: 'bg-red-800 bg-opacity-30 cursor-not-allowed',
    };

    return statusClasses[timeSlot.status] || 'hover:bg-gray-700 cursor-pointer';
  };

  const handleTimeSlotClick = async (date, hour) => {
    const timeSlot = findTimeSlot(date, hour);
    // Return early if the slot is unavailable or already reserved
    if (timeSlot && timeSlot.status === 'available') {
      handleMakeUnavailable(timeSlot);
    } else if (timeSlot && timeSlot.status === 'scheduled') {
      cancelReservation(timeSlot.reservationId);
    } else {
      handleMakeAvailable(date, hour);
    }
  };

  const handleMakeUnavailable = async (timeSlot) => {
    try {
      const response = await fetch(`${baseUrl}/flight/make-time-slot-unavailable`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeSlotId: timeSlot.timeSlotId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update time slot');
      }

      const updatedSlot = await response.json();
      setTimeSlots((prevState) => ({
        timeSlots: prevState.timeSlots.map((slot) => (slot.timeSlotId === timeSlot.timeSlotId ? updatedSlot : slot)),
      }));
    } catch (error) {
      console.error('Error managing time slot:', error);
    }
  };

  const handleMakeAvailable = async (date, hour) => {
    try {
      const response = await fetch(`${baseUrl}/flight/make-time-slot-available`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeSlotId: crypto.randomUUID(),
          participantType: participantType,
          participantId: participantId,
          startTime: new Date(date.setHours(hour, 0, 0, 0)).toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create time slot');
      }

      const data = await response.json();
      setTimeSlots((prevState) => ({
        timeSlots: [...prevState.timeSlots, data],
      }));
    } catch (error) {
      console.error('Error managing time slot:', error);
    }
  };

  const handleParticipantIdChange = (e) => {
    setParticipantId(e.target.value);
  };

  const handleParticipantTypeChange = (e) => {
    setParticipantType(e.target.value);
    setParticipantId(''); // Clear the input field
  };

  const cancelReservation = async (reservationId) => {
    try {
      const response = await fetch(`${baseUrl}/flight/reservation-cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reservationId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel reservation');
      }
    } catch (error) {
      console.error('Error canceling reservation:', error);
    }
  };

  const fetchReservationDetails = async (reservationId) => {
    try {
      const response = await fetch(`${baseUrl}/flight/reservation/${reservationId}`);
      if (!response.ok) throw new Error('Failed to fetch reservation details');
      const data = await response.json();
      return {
        id: data.reservationId,
        time: new Date(data.reservationTime).toLocaleString('en-US', { hour12: false }),
        studentId: data.student.participantId,
        instructorId: data.instructor.participantId,
        aircraftId: data.aircraft.participantId,
      };
    } catch (error) {
      console.error('Error fetching reservation details:', error);
      return null;
    }
  };

  const handleTimeSlotHover = async (e, timeSlot) => {
    if (timeSlot?.status === 'scheduled') {
      const details = await fetchReservationDetails(timeSlot.reservationId);
      if (details) {
        setTooltipData(details);
        setTooltipPosition({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const handleTimeSlotLeave = () => {
    setTooltipData(null);
  };

  return (
    <div className='flex flex-col h-screen bg-gray-900 text-gray-100'>
      {/* Header Controls */}
      <div className='p-4 bg-gray-800 border-b border-gray-700 flex justify-between'>
        <div className='flex items-center space-x-4'>
          <select className='bg-gray-700 text-gray-100 p-2 rounded' value={participantType} onChange={handleParticipantTypeChange}>
            <option value='student'>Student</option>
            <option value='instructor'>Instructor</option>
            <option value='aircraft'>Aircraft</option>
          </select>
          <input type='text' placeholder='Participant ID' className='bg-gray-700 text-gray-100 p-2 rounded' value={participantId} onChange={handleParticipantIdChange} />
          <h1 className='text-xl font-semibold text-yellow-500'>Plan Your Flight Availability</h1>
        </div>
        <Link
          to={`/reservations${baseUrl.startsWith('https://') ? `?host=${baseUrl.replace('https://', '')}` : ''}`}
          className='p-2 bg-gray-700 rounded hover:bg-gray-600 text-yellow-500 hover:text-white'
        >
          Reservations
        </Link>
      </div>

      {/* Calendar Grid */}
      <div className='flex flex-1 relative'>
        {/* Left Scroll Buttons */}
        <div className='absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-center space-y-4 bg-gray-800 bg-opacity-50 p-2'>
          <div className='text-sm text-center mb-4'>{visibleDays.length > 0 && formatScrollDate(visibleDays[0])}</div>
          <button onClick={() => handleScroll(-1)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center'>
            <ChevronLeft className='w-4 h-4' />
            <span>1d</span>
          </button>
          <button onClick={() => handleScroll(-7)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center'>
            <ChevronLeft className='w-4 h-4' />
            <span>7d</span>
          </button>
          <button onClick={() => handleScroll(-30)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center'>
            <ChevronLeft className='w-4 h-4' />
            <span>30d</span>
          </button>
        </div>

        {/* Time Slots Grid */}
        <div className='flex-1 overflow-x-hidden mx-16'>
          <div className='flex h-full flex-col'>
            {/* Header row */}
            <div className='flex'>
              {visibleDays.map((date) => (
                <div key={date.toISOString()} className='flex-1 min-w-[100px] border-l border-gray-700'>
                  <div className='text-sm text-center py-2'>{formatDate(date)}</div>
                </div>
              ))}
            </div>
            {/* Time slots grid */}
            <div className='flex flex-1'>
              {visibleDays.map((date) => (
                <div key={date.toISOString()} className='flex-1 min-w-[100px] border-l border-gray-700'>
                  <div className='flex flex-col h-full'>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const timeSlot = findTimeSlot(date, hour);
                      const isPast = isTimeSlotPast(date, hour);

                      return (
                        <div
                          key={hour}
                          className={`flex-1 border-t border-gray-700 p-0 text-xs flex flex-col justify-center ${getTimeSlotClassName(timeSlot, isPast)}`}
                          onClick={() => handleTimeSlotClick(date, hour)}
                          onMouseEnter={(e) => handleTimeSlotHover(e, timeSlot)}
                          onMouseLeave={handleTimeSlotLeave}
                        >
                          <div className='text-center truncate'>{String(hour).padStart(2, '0')}:00</div>
                          {timeSlot && <>{timeSlot.reservationId && <div className='text-xs truncate text-center'>{timeSlot.reservationId}</div>}</>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Scroll Buttons */}
        <div className='absolute right-0 top-0 bottom-0 w-16 flex flex-col justify-center space-y-4 bg-gray-800 bg-opacity-50 p-2'>
          <div className='text-sm text-center mb-4'>{visibleDays.length > 0 && formatScrollDate(visibleDays[visibleDays.length - 1])}</div>
          <button onClick={() => handleScroll(1)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center'>
            <ChevronRight className='w-4 h-4' />
            <span>1d</span>
          </button>
          <button onClick={() => handleScroll(7)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center'>
            <ChevronRight className='w-4 h-4' />
            <span>7d</span>
          </button>
          <button onClick={() => handleScroll(30)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center'>
            <ChevronRight className='w-4 h-4' />
            <span>30d</span>
          </button>
        </div>
      </div>

      {tooltipData && (
        <div
          className='fixed bg-blue-950/90 text-white rounded shadow-lg z-50 text-sm'
          style={{
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y + 50,
          }}
        >
          <div className='bg-blue-400 text-gray-900 font-semibold px-2 py-1'>Reservation: {tooltipData.id}</div>
          <div className='bg-gray-300 text-gray-900 px-2 py-1'>{tooltipData.time}</div>
          <div className='px-2 py-1 text-gray-200'>Student: {tooltipData.studentId}</div>
          <div className='px-2 py-1 text-gray-200'>Instructor: {tooltipData.instructorId}</div>
          <div className='px-2 py-1 text-gray-200'>Aircraft: {tooltipData.aircraftId}</div>
        </div>
      )}
    </div>
  );
};

export default TimeSlotScheduler;
