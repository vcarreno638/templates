/* ==========================================================================
* Product Name: Fit5 TypeScript
* Author: Emerson Kirby
* Description:  Typescript functionality for Fit5 challenge
* Version: 1.0 MOD Victor 2
* Release date: 24/05/2019
  ========================================================================== */
/// <reference path="../../../../UI/Web Site/JS/definitions/jquery.d.ts" />
/// <reference path="../../../../UI/Web Site/JS/definitions/ch.d.ts" />
/// <reference path="../../../../UI/Web Site/JS/Global.ts" />
/// <reference path="../../../../UI/Web Site/JS/API.ts" />
/// <reference path="../../../../UI/Web Site/JS/Resources.ts" />
/// <reference path="../../../../UI/Web Site/JS/Config.ts" />
/// <reference path="../../../../UI/Web Site/JS/Notify.ts" />
/// <reference path="../../../../UI/Web Site/JS/Common/PubSub.ts" />
/// <reference path="../../../../UI/Web Site/JS/Widget/GroupTip.ts" />
/// <reference path="../../../../UI/Web Site/JS/Widget/Progress.ts" />
var _wellscore, _challengeId, _challengeStart, _challengeEnd, _challengeWeeks, _today, _daysIn, _week, _selectedWeek, _weeks, _trackedItems, _admin, _ch = corehealth.web.js;
$(".challengewrapper").on("challengeloaded", function (e, challenge) {
    if (!challenge.ChallengeWellScore) {
        console.error("No Wellness Score on Challenge");
        return;
    }
    //console.log("challenge: ", challenge); 
    _challengeId = challenge.Id;
    _wellscore = challenge.ChallengeWellScore.Items;
    _challengeWeeks = _wellscore.length;
    _challengeStart = _ch.common.datetime.dateOnly(_ch.common.datetime.parseISO(challenge.JoinedDate));
    _challengeEnd = _ch.common.datetime.addDays(_challengeStart, 7 * _challengeWeeks);
    _today = _ch.common.datetime.today();
    _daysIn = _ch.common.datetime.daysDiff(_challengeStart, _today);
    _week = Math.max(1, Math.min(_challengeWeeks, Math.ceil((_daysIn + 1) / 7)));
    _selectedWeek = _week;
    if (!challenge.HasEnded) {
        $(".days-left .data").text(_ch.common.datetime.daysDiff(_today, _challengeEnd));
    }
    $(".week").html(kendo.format("<h3>Week {0}</h3>", _week));
    $("#page-banner").css({ "background": kendo.format("url('https://www.konnected.ca/templates/soi/Fit5Challenge/images/Week{0}.jpg')", _week), "background-size": "cover" });
    $.when(_ch.api.get("api/permission/1222")).done(function (canConfigureWellScore) {
        if (canConfigureWellScore && (_ch.common.url.getParamAsBool ? _ch.common.url.getParamAsBool("admin") : (_ch.common.url.getParameterByName("admin", true) == "true"))) {
            _admin = true;
            _week = _wellscore.length;
        }
        loadChallengeData();
        _ch.common.pubsub.subscribe("trackerchange", loadChallengeData, null);
        _ch.common.pubsub.subscribe("stepschanged", loadChallengeData, null);
        _ch.common.pubsub.subscribe("datechange", updateChallengeProgressData, null); // Date change doesn't need to reload challenge data
        // Progress
        $(".progress-bar").kendoProgressBar({
            type: "percent",
            animation: {
                duration: 600
            }
        });
        // Learning section
        var learnTabs = [];
        $.when(_ch.api.get(kendo.format('api/healthtips/challenge/{0}', challenge.Id))).done(function (healthtips) {
            for (var i = 0; i < _week; i++) {
                learnTabs.push({
                    Name: kendo.format("Week {0}", (i + 1)),
                    Content: healthtips[i].Content
                });
            }
            var tabStrip = $("#LearningTabStrip").kendoTabStrip({
                dataTextField: "Name",
                dataContentField: "Content",
                dataSource: learnTabs
            }).data("kendoTabStrip");
            tabStrip.select(_week - 1);
        });
        // Add your results section
        // TODO add your results section doesn't need to be _week dependent
        var weekData = _wellscore[_week - 1];
        // Drink tracker
        var drink = weekData.Items[1].Items;
        $.each(drink, function (idx, val) {
            initTrackers("drink-tracker", val.ObjectId);
        });
        // Eat tracker
        var eat = weekData.Items[2].Items;
        $.each(eat, function (idx, val) {
            initTrackers("eat-tracker", val.ObjectId);
        });
        // CUSTOM LEADERBOARD
        $.when(_ch.api.get('api/profile')).done(function (profile) {
            // The split on the URL is to remove the &maxsize so that we can get a bigger image
            $(".avatar-wrapper").prepend(kendo.format("<div><img class='leaderboard-avatar' src='{0}'></div>", profile.AvatarUrl.split('&')[0]));
        });
        $(".challenge-data").on("click", ".show-progress-button", function (event) {
            $(event.target).closest(".custom-tracker-wrapper").find(".goal-progress-wrapper").slideToggle("fast");
        });
        // Mind tracker
        var mind = weekData.Items[3].Items;
        $.each(mind, function (idx, val) {
            initTrackers("mind-tracker", val.ObjectId);
        });
    });
});
function updateChallengeProgressData(args) {
    _selectedWeek = getSelectedWeek(args.newDate);
    progressDisplay(_weeks[_selectedWeek - 1]);
    $("#LearningTabStrip").kendoTabStrip().data("kendoTabStrip").select(_selectedWeek - 1);
}
function getSelectedWeek(selectedDay) {
    for (var i = 0; i < _weeks.length; i++) {
        var week = _weeks[i];
        if (between(week.WeekStart, selectedDay, week.WeekEnd)) {
            return i + 1;
        }
        ;
    }
    ;
}
function between(a, x, b) {
    return (a <= x && x <= b);
}
function loadChallengeData() {
    _weeks = [];
    _trackedItems = [];
    var deferreds = [];
    var weekStart = _challengeStart;
    for (var i = 0; i < _wellscore.length; i++) {
        var weekEnd = _ch.common.datetime.addDays(weekStart, 6);
        deferreds = deferreds.concat(loadWeekData(i + 1, weekStart, weekEnd));
        // Goal for week is set as a property on the week group. Defaults to week number if not set
        var goal = i + 1;
        if (_wellscore[i].Properties) {
            goal = parseInt(_wellscore[i].Properties[0].Value);
        }
        var week = {
            WeekNumber: i + 1,
            WeekStart: weekStart,
            WeekEnd: weekEnd,
            EatPerDayGoal: goal,
            MindPerDayGoal: goal,
            ExercisePerWeekGoal: goal,
            DrinkPerDayGoal: goal,
            UserTrackedItems: null
        };
        _weeks.push(week);
        weekStart = _ch.common.datetime.addDays(weekEnd, 1);
    }
    // Collate tracker history with weeks data
    $.when.apply($, deferreds).done(function () {
        $.each(_weeks, function (idx, week) {
            // Filter to be items tracked during this week, sort by date, reverse to be ascending instead of descending
            week.UserTrackedItems = _trackedItems.filter(function (x) { return x.WeekNumber === idx + 1; }).sort(function (a, b) { return b.Date.getTime() - a.Date.getTime(); }).reverse();
        });
        calculateBadges(_weeks);
        progressDisplay(_weeks[_selectedWeek - 1]);
    });
    return deferreds;
}
function progressDisplay(week) {
    $.when(_ch.api.getTemplate("../shared/customers/specialolympicsinternational/fit5challenge/progresspopup")).done(function (tmpl) {
        $("#drink-tracker .goal-progress-wrapper .progress-header").nextAll().remove();
        var drink5 = calculateProgress(week, "drink 5");
        $.each(drink5, function (idx, progress) {
            $("#drink-tracker .goal-progress-wrapper").append(processTemplate(progress, tmpl));
        });
        $("#eat-tracker .goal-progress-wrapper .progress-header").nextAll().remove();
        var eat5 = calculateProgress(week, "eat 5");
        $.each(eat5, function (idx, progress) {
            $("#eat-tracker .goal-progress-wrapper").append(processTemplate(progress, tmpl));
        });
        $("#exercise-tracker .goal-progress-wrapper .progress-header").nextAll().remove();
        var exercise5 = calculateProgress(week, "exercise 5");
        $.each(exercise5, function (idx, progress) {
            $("#exercise-tracker .goal-progress-wrapper").append(processTemplate(progress, tmpl));
        });
        $("#mind-tracker .goal-progress-wrapper .progress-header").nextAll().remove();
        var mind5 = calculateProgress(week, "mind 5");
        $.each(mind5, function (idx, progress) {
            $("#mind-tracker .goal-progress-wrapper").append(processTemplate(progress, tmpl));
        });

    });
}
function processTemplate(data, tmpl) {
    var progressTmpl = kendo.template(tmpl);
    var progressData = {
        Date: data.Date,
        Amount: data.Amount,
        GoalMet: data.GoalMet
    };
    return progressTmpl(progressData);
}
function calculateProgress(week, tracker) {
    var weeklyProgress = [];
    var currentDay = week.WeekStart;
    var exerciseCount = 0;
    var exerciseGoalMet = "goal-not-met";
    var trackedItems = week.UserTrackedItems.filter((function (x) { return x.Name.toString().toLowerCase() === tracker; }));
    while (currentDay <= week.WeekEnd) {
        var amt = 0;
        var goalMet = undefined;
        var tracked = trackedItems.filter(function (t) { return t.Date.getTime() === currentDay.getTime(); });
        if (tracked.length >= 1) {
            switch (tracker) {
                case "drink 5":
                    // Tracker items will have only one item per day, so we can just select with [0]
                    amt = tracked[0].Amount;
                    if (amt >= week.DrinkPerDayGoal)
                        goalMet = "goal-met";
                    break;
                case "eat 5":
                    amt = tracked[0].Amount;
                    if (amt >= week.EatPerDayGoal)
                        goalMet = "goal-met";
                    break;
                case "exercise 5":
                    // Exercise can have multiple instances with different amounts tracked per day. This sums activity over day.
                    amt = tracked.map(function (i) { return i.Amount; }).reduce(function (a, b) { return a + b; }, 0);
                    if (amt >= 30)
                        exerciseCount++;
                    exerciseGoalMet = exerciseCount >= week.ExercisePerWeekGoal ? "goal-met" : "goal-not-met";
                    break;
                case "mind 5":
                    amt = tracked[0].Amount;
                    if (amt >= week.MindPerDayGoal)
                        goalMet = "goal-met";
                    break;
                default:
                    break;
            }
            ;
        }
        goalMet = goalMet ? goalMet : "goal-not-met";
        if (currentDay > _today && !_admin)
            goalMet = "goal-future";
        var progress = {
            Date: _ch.common.datetime.format(currentDay, "mmmm d"),
            Amount: amt,
            GoalMet: tracker == "exercise 5" ? exerciseGoalMet : goalMet
        };
        weeklyProgress.push(progress);
        currentDay = _ch.common.datetime.addDays(currentDay, 1);
    }
    return weeklyProgress;
}
function loadWeekData(weekNum, weekStart, weekEnd) {
    var deferreds = [];
    $.each(_wellscore[0].Items, function (idx, val) {
        var trackerId = val.Items[0].ObjectId;
        if (trackerId == _ch.common.util.emptyId()) {
            deferreds.push(loadExerciseData(weekNum, weekStart, weekEnd));
        }
        else {
            deferreds.push(loadTrackerData(weekNum, weekStart, weekEnd, trackerId));
        }
    });
    return deferreds;
}
function loadExerciseData(weekNum, weekStart, weekEnd) {
    var dfd = $.Deferred();
    _ch.api.get(kendo.format("api/history/activity?start={0}&end={1}", _ch.common.datetime.formatISO(weekStart), _ch.common.datetime.formatISO(weekEnd))).done(function (history) {
        $.each(history, function (idx, val) {
            var trackedItem = {
                WeekNumber: weekNum,
                Date: _ch.common.datetime.parseISO(val.Date),
                Name: "Exercise 5",
                Amount: val.Minutes
            };
            _trackedItems.push(trackedItem);
        });
        dfd.resolve();
    });
    // TODO add fail cases
    return dfd.promise();
}
function loadTrackerData(weekNum, weekStart, weekEnd, trackerId) {
    var dfd = $.Deferred();
    _ch.api.get(kendo.format("api/history/tracker/{0}?start={1}&end={2}", trackerId, _ch.common.datetime.formatISO(weekStart), _ch.common.datetime.formatISO(weekEnd))).done(function (history) {
        $.each(history, function (idx, val) {
            var trackedItem = {
                WeekNumber: weekNum,
                Date: _ch.common.datetime.parseISO(val.Date),
                Name: val.Name,
                Amount: val.Points
            };
            _trackedItems.push(trackedItem);
        });
        dfd.resolve();
    });
    // TODO add fail cases
    return dfd.promise();
}
function initTrackers(name, id) {
    var wellscoreItem = {
        Type: "tracker",
        TrackerItemId: id,
        FutureDays: _admin ? _ch.common.datetime.daysDiff(_today, _challengeEnd) : 0,
        PastDays: _daysIn,
        ShowTopHeader: true
    };
    $(kendo.format("#{0} .custom-tracker", name)).append("<div id='" + id + "'></div>");
    corehealth.web.js.widget.initWithProps($("#" + id), wellscoreItem).done(function (complete) {
        var trackerRowSelectorString = kendo.format("#{0} > table > tbody > tr:nth-child(2)", id);
        // Reverse the order elements inside of table row so that div buttons sit below points text. Cleaner than attempting to do with css, as these are td's & tr's we're dealing with.
        $(trackerRowSelectorString).append($(trackerRowSelectorString).children().get().reverse());
        // ADD ONE button (imgUp & imgUpDis)
        $("#" + id + " .imgUp").html("<div class='imgUpText'><div>+</div><div><strong>ADD ONE</strong></div></div>");
        $("#" + id + " .imgUpDis").html("<div class='imgUpTextDis'><div>+</div><div><strong>ADD ONE</strong></div></div>");
        // REMOVE ONE button (imgDown & imgDownDis)
        $("#" + id + " .imgDown").html("<div class='imgDownText'><div>-</div><div><strong>REMOVE ONE</strong></div></div>");
        $("#" + id + " .imgDownDis").html("<div class='imgDownTextDis'><div>-</div><div><strong>REMOVE ONE</strong></div></div>");
    });
}
function calculateBadges(weeks) {
    var drinkBadges = 0, eatBadges = 0, exerciseBadges = 0, mindBadges = 0, trophies = 0, totalPoints = 137;
    var _loop_1 = function () {
        var week = weeks[i];
        date = week.WeekStart;
        dateExerciseSum = 0;
        // Count badges 
        $.each(week.UserTrackedItems, function (idx, item) {
            switch (item.Name.toString().toLowerCase()) {
                case "drink 5":
                    if (item.Amount >= week.DrinkPerDayGoal)
                        drinkBadges++;
                    break;
                case "eat 5":
                    if (item.Amount >= week.EatPerDayGoal)
                        eatBadges++;
                    break;
                case "exercise 5":
                    // Special case for exercise - track 30 minutes of exercise {days} a week.
                    if (date.getTime() === item.Date.getTime()) {
                        dateExerciseSum += item.Amount;
                    }
                    else {
                        dateExerciseSum = item.Amount;
                        date = item.Date;
                    }
                    if (dateExerciseSum >= 30 && exerciseBadges < week.ExercisePerWeekGoal)
                        exerciseBadges++;
                    break;
                case "mind 5":
                    if (item.Amount >= week.MindPerDayGoal)
                        mindBadges++;
                    break;
                default:
                    break;
            }
            ;
        });
        // Trophies
        if (drinkBadges >= 7 && eatBadges >= 7 && exerciseBadges >= mindBadges >= 7 && week.ExercisePerWeekGoal)
            trophies++;
    };
    var date, dateExerciseSum;
    for (var i = 0; i < _week; i++) {
        _loop_1();
    }
    ;
    // TODO change out to all use ID's instead of classes and id's
    $("#exercise-badge").text(exerciseBadges);
    $("#drink-badge").text(drinkBadges);
    $("#eat-badge").text(eatBadges);
    $("#mind-badge").text(mindBadges);
    $(".trophies-total").text(trophies);
    $(".badges-total").text(drinkBadges + eatBadges + exerciseBadges + mindBadges);
    // TODO Make total points calc dynamic as well - need to change out hardcoded values in the html
    $.when(_ch.api.get(kendo.format("api/wellscore/user?wellscoreid={0}", _challengeId))).done(function (wellscore) {
        $(".user-points").text(Math.min(wellscore.TotalPoints, totalPoints));
        $(".total-points").text(totalPoints);
        var progressPercent = Math.min(Math.max(((drinkBadges + eatBadges + exerciseBadges + mindBadges) / 137) * 100, 0), 100);
        $(".progress-bar").data("kendoProgressBar").value(Math.round(progressPercent));
        $("#my-total-progress").text(kendo.format("{0}%", Math.round(progressPercent)));
    });
}
// Scroll to top button.
//Check to see if the window is top if not then display button.
$(window).scroll(function () {
    if ($(this).scrollTop() > 100) {
        $('.scrollToTop').fadeIn();
    }
    else {
        $('.scrollToTop').fadeOut();
    }
});
// setting scroll for back to top button seperately, 
// because I can't add an anchor tag to the HTML body from client side code.
$('.scrollToTop').on("click", function () {
    $("html, body").stop().animate({
        scrollTop: 0
    }, 1000);
});
// Smooth scrolling for anchor tags.
$('a[href^="#"]').on('click', function (event) {
    var target = $(this.getAttribute('href'));
    if (target.length) {
        event.preventDefault();
        $('html, body').stop().animate({
            scrollTop: target.offset().top
        }, 1000);
    }
});
//# sourceMappingURL=template.js.map